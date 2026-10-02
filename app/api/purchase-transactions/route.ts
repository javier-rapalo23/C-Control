import { Prisma } from '@prisma/client';
import { createPurchaseTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { recalculateDailyBalance } from '@/lib/ledger';
import { calcularCompra } from '@/lib/purchase-draft';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/payment-methods';
import { formatNumeroInterno } from '@/lib/build-invoice';

function mapTransaction(transaction: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  clientId: string;
  metodoPago: string;
  numeroFactura: string | null;
  numeroInterno: number;
  bono: Prisma.Decimal;
  bonoMotivo: string | null;
  descuento: Prisma.Decimal;
  descuentoMotivo: string | null;
  total: Prisma.Decimal;
  pagoFecha: Date | null;
  pagoMetodo: string | null;
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
    porcentajeOro: Prisma.Decimal | null;
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
    numeroFactura: transaction.numeroFactura,
    numeroInterno: formatNumeroInterno('compra', transaction.numeroInterno),
    // El subtotal no se guarda: es la suma de las líneas, que ya viajan en la respuesta.
    subtotal: transaction.items.reduce((suma, item) => suma + Number(item.total), 0),
    bono: Number(transaction.bono),
    bonoMotivo: transaction.bonoMotivo,
    descuento: Number(transaction.descuento),
    descuentoMotivo: transaction.descuentoMotivo,
    total: Number(transaction.total),
    pagoFecha: transaction.pagoFecha ? toBusinessDateString(transaction.pagoFecha) : null,
    pagoMetodo: transaction.pagoMetodo,
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
      porcentajeOro: item.porcentajeOro !== null ? Number(item.porcentajeOro) : null,
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
      // El cálculo es el mismo que usa la vista previa de la boleta: lo que se revisó en
      // pantalla es lo que se guarda.
      const { client, sucursalId, items, bono, descuento, total } = await calcularCompra(tx, payload);

      const createdTransaction = await tx.purchaseTransaction.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          clientId: client.id,
          metodoPago: payload.metodoPago ?? DEFAULT_PAYMENT_METHOD,
          numeroFactura: payload.numeroFactura ?? null,
          bono,
          bonoMotivo: payload.bonoMotivo ?? null,
          descuento,
          descuentoMotivo: payload.descuentoMotivo ?? null,
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

    if (error instanceof Error && error.message === 'NEGATIVE_TOTAL') {
      return failure('VALIDATION_ERROR', 'El descuento no puede ser mayor que el café más el bono', 400);
    }

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}