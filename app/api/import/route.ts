import { Prisma } from '@prisma/client';
import { handleApiError, success } from '@/lib/api-response';
import { parseBusinessDate } from '@/lib/business-date';
import { prisma } from '@/lib/prisma';
import { recalculateDailyBalance } from '@/lib/ledger';

type ImportMaterial = {
  id?: string;
  nombre: string;
  precioPorLibra: number;
};

type ImportPurchase = {
  materialId?: string;
  material?: string;
  precioPorLibra: number;
  libras: number;
  total?: number;
};

type ImportSale = {
  descripcion: string;
  monto: number;
};

type ImportExpense = {
  categoria: string;
  descripcion: string;
  monto: number;
};

type ImportLedger = {
  businessDate: string;
  saldoInicial: number;
  purchases?: ImportPurchase[];
  sales?: ImportSale[];
  expenses?: ImportExpense[];
};

type ImportPayload = {
  materials: ImportMaterial[];
  ledgers: ImportLedger[];
};

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractJsonObjects(raw: string): unknown[] {
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }

      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const chunk = raw.slice(start, index + 1);
        try {
          objects.push(JSON.parse(chunk));
        } catch {
          // Skip invalid object chunks.
        }
        start = -1;
      }
    }
  }

  return objects;
}

function isImportPayload(value: unknown): value is ImportPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<ImportPayload>;
  return Array.isArray(payload.materials) && Array.isArray(payload.ledgers);
}

async function parseImportPayload(request: Request): Promise<ImportPayload> {
  const rawText = await request.text();
  if (!rawText.trim()) {
    throw new Error('Request body is empty');
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (isImportPayload(parsed)) {
      return parsed;
    }
  } catch {
    // Continue with multi-object parser.
  }

  const parsedObjects = extractJsonObjects(rawText);
  const payload = parsedObjects.find(isImportPayload);
  if (!payload) {
    throw new Error('Import payload must include materials and ledgers');
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const payload = await parseImportPayload(request);

    if (payload.materials.length === 0) {
      throw new Error('materials cannot be empty');
    }

    const mobileIdToName = new Map<string, string>();

    for (const item of payload.materials) {
      const nombre = item.nombre?.trim();
      const precioPorLibra = Number(item.precioPorLibra);

      if (!nombre) {
        continue;
      }

      if (!Number.isFinite(precioPorLibra) || precioPorLibra <= 0) {
        continue;
      }

      if (item.id?.trim()) {
        mobileIdToName.set(item.id.trim(), nombre);
      }

      await prisma.producto.upsert({
        where: { nombre },
        update: { precioPorLibra: new Prisma.Decimal(precioPorLibra) },
        create: {
          nombre,
          precioPorLibra: new Prisma.Decimal(precioPorLibra),
        },
      });
    }

    let materials = await prisma.producto.findMany();
    const materialByNormalizedName = new Map<string, (typeof materials)[number]>();
    for (const material of materials) {
      materialByNormalizedName.set(normalizeName(material.nombre), material);
    }

    let importedDays = 0;
    let importedPurchases = 0;
    let importedSales = 0;
    let importedExpenses = 0;

    for (const ledger of payload.ledgers) {
      const businessDate = parseBusinessDate(ledger.businessDate);
      const purchaseRows: Array<{
        businessDate: Date;
        productoId: string;
        productoNombre: string;
        precioPorLibra: Prisma.Decimal;
        libras: Prisma.Decimal;
        total: Prisma.Decimal;
      }> = [];
      const saleRows: Array<{
        businessDate: Date;
        descripcion: string;
        monto: Prisma.Decimal;
      }> = [];
      const expenseRows: Array<{
        businessDate: Date;
        categoria: string;
        descripcion: string;
        monto: Prisma.Decimal;
      }> = [];

      await prisma.$transaction(async (tx) => {
        await tx.purchase.deleteMany({ where: { businessDate } });
        await tx.purchaseTransaction.deleteMany({ where: { businessDate } });
        await tx.sale.deleteMany({ where: { businessDate } });
        await tx.expense.deleteMany({ where: { businessDate } });

        for (const purchase of ledger.purchases ?? []) {
          const materialNameFromId = purchase.materialId ? mobileIdToName.get(purchase.materialId) : undefined;
          const candidateName = purchase.material?.trim() || materialNameFromId?.trim() || purchase.materialId?.trim();

          if (!candidateName) {
            continue;
          }

          const normalized = normalizeName(candidateName);
          let producto = materialByNormalizedName.get(normalized);

          if (!producto) {
            const safePrice = Number(purchase.precioPorLibra);
            if (!Number.isFinite(safePrice) || safePrice <= 0) {
              continue;
            }

            producto = await tx.producto.create({
              data: {
                nombre: candidateName,
                precioPorLibra: new Prisma.Decimal(safePrice),
              },
            });

            materials = [...materials, producto];
            materialByNormalizedName.set(normalized, producto);
          }

          const precioPorLibra = Number(purchase.precioPorLibra);
          const libras = Number(purchase.libras);
          if (!Number.isFinite(precioPorLibra) || !Number.isFinite(libras) || precioPorLibra <= 0 || libras <= 0) {
            continue;
          }

          const total = new Prisma.Decimal(precioPorLibra).mul(new Prisma.Decimal(libras));

          purchaseRows.push({
            businessDate,
            productoId: producto.id,
            productoNombre: producto.nombre,
            precioPorLibra: new Prisma.Decimal(precioPorLibra),
            libras: new Prisma.Decimal(libras),
            total,
          });

          importedPurchases += 1;
        }

        for (const sale of ledger.sales ?? []) {
          const monto = Number(sale.monto);
          const descripcion = sale.descripcion?.trim();
          if (!descripcion || !Number.isFinite(monto) || monto <= 0) {
            continue;
          }

          saleRows.push({
            businessDate,
            descripcion,
            monto: new Prisma.Decimal(monto),
          });

          importedSales += 1;
        }

        for (const expense of ledger.expenses ?? []) {
          const monto = Number(expense.monto);
          const categoria = expense.categoria?.trim();
          const descripcion = expense.descripcion?.trim();
          if (!categoria || !descripcion || !Number.isFinite(monto) || monto <= 0) {
            continue;
          }

          expenseRows.push({
            businessDate,
            categoria,
            descripcion,
            monto: new Prisma.Decimal(monto),
          });

          importedExpenses += 1;
        }

        if (purchaseRows.length > 0) {
          await tx.purchase.createMany({ data: purchaseRows });
        }

        if (saleRows.length > 0) {
          await tx.sale.createMany({ data: saleRows });
        }

        if (expenseRows.length > 0) {
          await tx.expense.createMany({ data: expenseRows });
        }
      });

      await recalculateDailyBalance(prisma, ledger.businessDate);

      importedDays += 1;
    }

    const imported = {
      importedDays,
      importedProductos: materials.length,
      importedPurchases,
      importedSales,
      importedExpenses,
    };

    return success(
      {
        imported,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
