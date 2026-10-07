import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { createClientPaymentSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { requireSessionUser } from '@/lib/request-user';
import { CASH_PAYMENT_METHOD } from '@/lib/payment-methods';
import {
  ReceivableError,
  clientPaymentInclude,
  distribuirAbono,
  findPendingCreditSales,
  lockClient,
  mapClientPayment,
  saldoVenta,
} from '@/lib/receivables';

/**
 * Abonos de clientes. Filtra por `clientId`, o por `businessDate` y `sucursalId` para
 * ver lo que entró en la caja de un día.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const businessDate = searchParams.get('businessDate');
    const sucursalId = searchParams.get('sucursalId');

    const payments = await prisma.clientPayment.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        ...(businessDate ? { businessDate: parseBusinessDate(businessDate) } : {}),
        ...(sucursalId ? { sucursalId } : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      include: clientPaymentInclude,
      take: 500,
    });

    return success(payments.map(mapClientPayment));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Registra un abono y lo reparte entre las ventas a crédito del cliente. Si es en
 * efectivo, suma a la caja de `businessDate` en la bodega que lo recibe.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = createClientPaymentSchema.parse(await request.json());
    const registradoPor = await requireSessionUser(request);

    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: payload.clientId } });
      if (!client) {
        throw new ReceivableError('Cliente no encontrado', 404, 'NOT_FOUND');
      }

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      if (payload.metodoPago === CASH_PAYMENT_METHOD) {
        await assertCashOpen(tx, payload.businessDate, sucursalId);
      }

      await lockClient(tx, client.id);
      // Un abono no puede pagar una venta que todavía no existía en esa fecha.
      const pendientes = (await findPendingCreditSales(tx, client.id))
        .filter((venta) => toBusinessDateString(venta.businessDate) <= payload.businessDate)
        .map((venta) => ({ id: venta.id, saldo: saldoVenta(venta) }));

      const aplicaciones = distribuirAbono(pendientes, new Prisma.Decimal(payload.monto), payload.saleTransactionId);

      const payment = await tx.clientPayment.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          clientId: client.id,
          metodoPago: payload.metodoPago,
          monto: payload.monto,
          referencia: payload.referencia ?? null,
          notas: payload.notas ?? null,
          registradoPor,
          aplicaciones: { create: aplicaciones },
        },
        include: clientPaymentInclude,
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return payment;
    });

    return success(mapClientPayment(created), 201);
  } catch (error) {
    if (error instanceof ReceivableError) {
      return failure(error.code, error.message, error.status);
    }
    return handleApiError(error);
  }
}
