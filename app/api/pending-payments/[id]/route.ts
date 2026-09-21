import type { NextRequest } from 'next/server';
import { payPendingPurchaseSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance } from '@/lib/ledger';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { requireSessionUser } from '@/lib/request-user';
import { PENDING_PAYMENT_METHOD } from '@/lib/payment-methods';
import { mapPendingPayment, pendingPaymentInclude } from '@/lib/pending-payments';

type Params = {
  params: Promise<{ id: string }>;
};

class PendingPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Paga una compra pendiente en la caja de `businessDate`. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const payload = payPendingPurchaseSchema.parse(await request.json());
    const registradoPor = await requireSessionUser(request);

    const paid = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseTransaction.findUnique({ where: { id } });
      if (!existing) {
        throw new PendingPaymentError('Compra no encontrada', 404, 'NOT_FOUND');
      }
      if (existing.metodoPago !== PENDING_PAYMENT_METHOD) {
        throw new PendingPaymentError('Esta compra no tiene pago pendiente', 409, 'CONFLICT');
      }
      if (existing.pagoFecha) {
        throw new PendingPaymentError(
          `Esta compra ya se pagó el ${toBusinessDateString(existing.pagoFecha)}`,
          409,
          'CONFLICT',
        );
      }
      // Fechas `YYYY-MM-DD`: la comparación de texto respeta el orden cronológico.
      if (payload.businessDate < toBusinessDateString(existing.businessDate)) {
        throw new PendingPaymentError('El pago no puede ser anterior a la fecha de la compra', 400, 'VALIDATION_ERROR');
      }

      await assertCashOpen(tx, payload.businessDate, existing.sucursalId);

      const updated = await tx.purchaseTransaction.update({
        where: { id },
        data: {
          pagoFecha: parseBusinessDate(payload.businessDate),
          pagoMetodo: payload.metodoPago,
          pagoRegistradoPor: registradoPor,
          pagadoEn: new Date(),
        },
        include: pendingPaymentInclude,
      });

      await recalculateDailyBalance(tx, payload.businessDate, existing.sucursalId);
      return updated;
    });

    return success(mapPendingPayment(paid));
  } catch (error) {
    if (error instanceof PendingPaymentError) {
      return failure(error.code, error.message, error.status);
    }
    return handleApiError(error);
  }
}

/** Deshace el pago: la compra vuelve a quedar pendiente. */
export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const reverted = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseTransaction.findUnique({ where: { id } });
      if (!existing) {
        throw new PendingPaymentError('Compra no encontrada', 404, 'NOT_FOUND');
      }
      if (!existing.pagoFecha) {
        throw new PendingPaymentError('Esta compra no tiene un pago registrado', 409, 'CONFLICT');
      }

      const pagoFecha = toBusinessDateString(existing.pagoFecha);
      await assertCashOpen(tx, pagoFecha, existing.sucursalId);

      const updated = await tx.purchaseTransaction.update({
        where: { id },
        data: { pagoFecha: null, pagoMetodo: null, pagoRegistradoPor: null, pagadoEn: null },
        include: pendingPaymentInclude,
      });

      await recalculateDailyBalance(tx, pagoFecha, existing.sucursalId);
      return updated;
    });

    return success(mapPendingPayment(reverted));
  } catch (error) {
    if (error instanceof PendingPaymentError) {
      return failure(error.code, error.message, error.status);
    }
    return handleApiError(error);
  }
}
