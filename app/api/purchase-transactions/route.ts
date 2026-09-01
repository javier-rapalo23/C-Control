import { Prisma } from '@prisma/client';
import { createPurchaseTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/payment-methods';

function mapTransaction(transaction: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  clientId: string;
  metodoPago: string;
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
    productoId: string;
    productoNombre: string;
    precioPorLibra: Prisma.Decimal;
    pesoBruto: Prisma.Decimal | null;
    numeroSacos: number | null;
    taraPorSaco: Prisma.Decimal | null;
    quintalesOro: Prisma.Decimal | null;
    libras: Prisma.Decimal;
    total: Prisma.Decimal;
    purchaseTransactionId: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: transaction.id,
    businessDate: toBusinessDateString(transaction.businessDate),
    sucursalId: transaction.sucursalId,
    clientId: transaction.clientId,
    metodoPago: transaction.metodoPago,
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
      precioPorLibra: Number(item.precioPorLibra),
      pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
      numeroSacos: item.numeroSacos,
      taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
      quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
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
    const sucursalIdParam = searchParams.get('sucursalId');
    const where: { businessDate?: Date; sucursalId?: string } = {};
    if (businessDateParam) where.businessDate = parseBusinessDate(businessDateParam);
    if (sucursalIdParam) where.sucursalId = sucursalIdParam;

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

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      const items = await Promise.all(
        payload.items.map(async (item) => {
          const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
          if (!producto) {
            throw new Error(`Producto not found: ${item.productoId}`);
          }

          const precioPorLibra = new Prisma.Decimal(item.precioPorLibra ?? Number(producto.precioPorLibra));

          let pesoBruto: Prisma.Decimal | null = null;
          let numeroSacos: number | null = null;
          let taraPorSaco: Prisma.Decimal | null = null;
          let libras: Prisma.Decimal;

          if (item.pesoBruto !== undefined) {
            pesoBruto = new Prisma.Decimal(item.pesoBruto);
            numeroSacos = item.numeroSacos ?? 0;
            taraPorSaco = new Prisma.Decimal(item.taraPorSaco ?? Number(producto.taraPorSaco ?? 0));
            const taraTotal = taraPorSaco.mul(numeroSacos);
            libras = pesoBruto.sub(taraTotal);
          } else {
            libras = new Prisma.Decimal(item.libras ?? 0);
          }

          const factorConversionOro = new Prisma.Decimal(producto.factorConversionOro ?? 1);
          const quintalesOro = libras.div(100).mul(factorConversionOro);

          const total = precioPorLibra.mul(libras);

          return {
            businessDate: parseBusinessDate(payload.businessDate),
            sucursalId,
            productoId: producto.id,
            productoNombre: producto.nombre,
            precioPorLibra,
            pesoBruto,
            numeroSacos,
            taraPorSaco,
            quintalesOro,
            libras,
            total,
          };
        }),
      );

      const total = items.reduce((accumulator, item) => accumulator.add(item.total), new Prisma.Decimal(0));

      const createdTransaction = await tx.purchaseTransaction.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          clientId: client.id,
          metodoPago: payload.metodoPago ?? DEFAULT_PAYMENT_METHOD,
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

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}