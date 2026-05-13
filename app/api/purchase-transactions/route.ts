import { Prisma } from '@prisma/client';
import { createPurchaseTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { recalculateDailyBalance } from '@/lib/ledger';

function mapTransaction(transaction: {
  id: string;
  businessDate: Date;
  clientId: string;
  total: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    rtn: string | null;
    cuentaBancaria: string | null;
    notas: string | null;
    esGeneral: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  items: Array<{
    id: string;
    businessDate: Date;
    materialId: string;
    materialNombre: string;
    precioPorLibra: Prisma.Decimal;
    libras: Prisma.Decimal;
    total: Prisma.Decimal;
    purchaseTransactionId: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: transaction.id,
    businessDate: toBusinessDateString(transaction.businessDate),
    clientId: transaction.clientId,
    total: Number(transaction.total),
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    client: {
      ...transaction.client,
      telefono: transaction.client.telefono ?? null,
      direccion: transaction.client.direccion ?? null,
      rtn: transaction.client.rtn ?? null,
      cuentaBancaria: transaction.client.cuentaBancaria ?? null,
      notas: transaction.client.notas ?? null,
      createdAt: transaction.client.createdAt.toISOString(),
      updatedAt: transaction.client.updatedAt.toISOString(),
    },
    items: transaction.items.map((item) => ({
      id: item.id,
      businessDate: toBusinessDateString(item.businessDate),
      materialId: item.materialId,
      materialNombre: item.materialNombre,
      precioPorLibra: Number(item.precioPorLibra),
      libras: Number(item.libras),
      total: Number(item.total),
      purchaseTransactionId: item.purchaseTransactionId,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDateParam = searchParams.get('businessDate');
    const where = businessDateParam
      ? {
          businessDate: parseBusinessDate(businessDateParam),
        }
      : undefined;

    const transactions = await prisma.purchaseTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    });

    return success({
      businessDate: businessDateParam,
      transactions: transactions.map(mapTransaction),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createPurchaseTransactionSchema.parse(await request.json());

    const transaction = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: payload.clientId } });
      if (!client) {
        throw new Error('Client not found');
      }

      const items = await Promise.all(
        payload.items.map(async (item) => {
          const material = await tx.material.findUnique({ where: { id: item.materialId } });
          if (!material) {
            throw new Error(`Material not found: ${item.materialId}`);
          }

          const precioPorLibra = new Prisma.Decimal(item.precioPorLibra ?? Number(material.precioPorLibra));
          const libras = new Prisma.Decimal(item.libras);
          const total = precioPorLibra.mul(libras);

          return {
            businessDate: parseBusinessDate(payload.businessDate),
            materialId: material.id,
            materialNombre: material.nombre,
            precioPorLibra,
            libras,
            total,
          };
        }),
      );

      const total = items.reduce((accumulator, item) => accumulator.add(item.total), new Prisma.Decimal(0));

      const createdTransaction = await tx.purchaseTransaction.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          clientId: client.id,
          total,
          items: {
            create: items,
          },
        },
        include: {
          client: true,
          items: true,
        },
      });

      await recalculateDailyBalance(tx, payload.businessDate);
      return createdTransaction;
    });

    return success(mapTransaction(transaction), 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return failure('NOT_FOUND', error.message, 404);
    }

    if (error instanceof Error && error.message.startsWith('Material not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}