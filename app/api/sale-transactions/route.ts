import { Prisma } from '@prisma/client';
import { createSaleTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { computeQuintalesOro } from '@/lib/oro';

function mapTransaction(transaction: {
  id: string;
  businessDate: Date;
  sucursalId: string;
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
    sucursalId: string;
    productoId: string | null;
    productoNombre: string | null;
    precioPorLibra: Prisma.Decimal | null;
    pesoBruto: Prisma.Decimal | null;
    numeroSacos: number | null;
    taraPorSaco: Prisma.Decimal | null;
    libras: Prisma.Decimal | null;
    porcentajeOro: Prisma.Decimal | null;
    quintalesOro: Prisma.Decimal | null;
    precioPorQuintalOro: Prisma.Decimal | null;
    descripcion: string | null;
    monto: Prisma.Decimal;
    saleTransactionId: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: transaction.id,
    businessDate: toBusinessDateString(transaction.businessDate),
    sucursalId: transaction.sucursalId,
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
      sucursalId: item.sucursalId,
      productoId: item.productoId,
      productoNombre: item.productoNombre,
      precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : null,
      pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
      numeroSacos: item.numeroSacos,
      taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
      libras: item.libras !== null ? Number(item.libras) : null,
      porcentajeOro: item.porcentajeOro !== null ? Number(item.porcentajeOro) : null,
      quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
      precioPorQuintalOro: item.precioPorQuintalOro !== null ? Number(item.precioPorQuintalOro) : null,
      descripcion: item.descripcion,
      monto: Number(item.monto),
      saleTransactionId: item.saleTransactionId,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDateParam = searchParams.get('businessDate');
    const sucursalIdParam = searchParams.get('sucursalId');
    const where: { businessDate?: Date; sucursalId?: string } = {};
    if (businessDateParam) where.businessDate = parseBusinessDate(businessDateParam);
    if (sucursalIdParam) where.sucursalId = sucursalIdParam;

    const transactions = await prisma.saleTransaction.findMany({
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
    const payload = createSaleTransactionSchema.parse(await request.json());

    const transaction = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: payload.clientId } });
      if (!client) {
        throw new Error('Client not found');
      }

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      const items = await Promise.all(
        payload.items.map(async (item) => {
          const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
          if (!producto) {
            throw new Error(`Producto not found: ${item.productoId}`);
          }

          // Mismo pesaje que compras: con peso bruto, las libras son el neto.
          let pesoBruto: Prisma.Decimal | null = null;
          let numeroSacos: number | null = null;
          let taraPorSaco: Prisma.Decimal | null = null;
          let libras: Prisma.Decimal;

          if (item.pesoBruto !== undefined) {
            pesoBruto = new Prisma.Decimal(item.pesoBruto);
            numeroSacos = item.numeroSacos ?? 0;
            taraPorSaco = new Prisma.Decimal(item.taraPorSaco ?? Number(producto.taraPorSaco ?? 0));
            libras = pesoBruto.sub(taraPorSaco.mul(numeroSacos));
            if (libras.lte(0)) {
              throw new Error('INVALID_NET_WEIGHT');
            }
          } else {
            libras = new Prisma.Decimal(item.libras ?? 0);
          }

          const pesaje = { pesoBruto, numeroSacos, taraPorSaco };

          if (item.precioPorQuintalOro !== undefined) {
            // Modo Oro: la conversión es la misma que en compras (`lib/oro.ts`).
            const porcentajeOro = new Prisma.Decimal(item.porcentajeOro!);
            const precioPorQuintalOro = new Prisma.Decimal(item.precioPorQuintalOro);
            const quintalesOro = computeQuintalesOro(libras, porcentajeOro);
            const monto = quintalesOro.mul(precioPorQuintalOro);

            return {
              businessDate: parseBusinessDate(payload.businessDate),
              sucursalId,
              productoId: producto.id,
              productoNombre: producto.nombre,
              precioPorLibra: null,
              ...pesaje,
              libras,
              porcentajeOro,
              quintalesOro,
              precioPorQuintalOro,
              monto,
            };
          }

          // El esquema exige `precioPorLibra` fuera del modo oro: el catálogo ya no
          // guarda precio del que tirar.
          const precioPorLibra = new Prisma.Decimal(item.precioPorLibra!);
          const monto = precioPorLibra.mul(libras);

          // Por libra el rendimiento es opcional y no toca el monto: igual que en
          // compras, los quintales oro quedan solo como referencia.
          const porcentajeOro = item.porcentajeOro !== undefined ? new Prisma.Decimal(item.porcentajeOro) : null;
          const quintalesOro = porcentajeOro !== null ? computeQuintalesOro(libras, porcentajeOro) : null;

          return {
            businessDate: parseBusinessDate(payload.businessDate),
            sucursalId,
            productoId: producto.id,
            productoNombre: producto.nombre,
            precioPorLibra,
            ...pesaje,
            libras,
            porcentajeOro,
            quintalesOro,
            precioPorQuintalOro: null,
            monto,
          };
        }),
      );

      const total = items.reduce((accumulator, item) => accumulator.add(item.monto), new Prisma.Decimal(0));

      const createdTransaction = await tx.saleTransaction.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
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

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return createdTransaction;
    });

    return success(mapTransaction(transaction), 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return failure('NOT_FOUND', error.message, 404);
    }

    if (error instanceof Error && error.message === 'INVALID_NET_WEIGHT') {
      return failure('VALIDATION_ERROR', 'La tara no puede ser mayor o igual al peso bruto', 400);
    }

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}
