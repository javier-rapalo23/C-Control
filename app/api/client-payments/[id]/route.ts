import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance } from '@/lib/ledger';
import { toBusinessDateString } from '@/lib/business-date';
import { CASH_PAYMENT_METHOD } from '@/lib/payment-methods';

type Params = {
  params: Promise<{ id: string }>;
};

/** Deshace un abono: sus ventas vuelven a deber lo que cubría. */
export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.clientPayment.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const businessDate = toBusinessDateString(existing.businessDate);
      // Solo el efectivo movió la caja: borrarlo cambia un saldo que puede estar cerrado.
      if (existing.metodoPago === CASH_PAYMENT_METHOD) {
        await assertCashOpen(tx, businessDate, existing.sucursalId);
      }

      await tx.clientPayment.delete({ where: { id } });
      await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Abono no encontrado', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
