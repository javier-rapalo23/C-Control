import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance } from '@/lib/ledger';
import { toBusinessDateString } from '@/lib/business-date';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseTransaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        return null;
      }

      await assertCashOpen(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);

      // Una compra pendiente ya pagada también movió la caja del día del pago:
      // esa caja tiene que estar abierta y su saldo se recalcula.
      const pagoFecha = existing.pagoFecha ? toBusinessDateString(existing.pagoFecha) : null;
      if (pagoFecha) {
        await assertCashOpen(tx, pagoFecha, existing.sucursalId);
      }

      await tx.purchaseTransaction.delete({ where: { id } });
      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);
      if (pagoFecha) {
        await recalculateDailyBalance(tx, pagoFecha, existing.sucursalId);
      }
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Purchase transaction not found', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}