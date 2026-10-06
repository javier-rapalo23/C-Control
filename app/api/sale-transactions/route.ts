import { Prisma } from '@prisma/client';
import { createSaleTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { recalculateDailyBalance } from '@/lib/ledger';
import { calcularVenta } from '@/lib/sale-draft';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/payment-methods';
import { formatNumeroInterno } from '@/lib/build-invoice';

function mapTransaction(transaction: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  clientId: string;
  numeroInterno: number;
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
    numeroInterno: formatNumeroInterno('venta', transaction.numeroInterno),
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
      // El cálculo es el mismo que usa la vista previa de la factura: lo que se revisó
      // en pantalla es lo que se guarda.
      const { client, sucursalId, items, total } = await calcularVenta(tx, payload);

      const createdTransaction = await tx.saleTransaction.create({
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

    if (error instanceof Error && error.message === 'INVALID_NET_WEIGHT') {
      return failure('VALIDATION_ERROR', 'La tara no puede ser mayor o igual al peso bruto', 400);
    }

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}
