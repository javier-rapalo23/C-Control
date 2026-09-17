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
      const existing = await tx.cashTransfer.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      // Borrarlo devuelve el dinero en las dos cajas: ambas deben estar abiertas.
      const businessDate = toBusinessDateString(existing.businessDate);
      await assertCashOpen(tx, businessDate, existing.sucursalOrigenId);
      await assertCashOpen(tx, businessDate, existing.sucursalDestinoId);

      await tx.cashTransfer.delete({ where: { id } });
      await recalculateDailyBalance(tx, businessDate, existing.sucursalOrigenId);
      await recalculateDailyBalance(tx, businessDate, existing.sucursalDestinoId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Traslado de efectivo no encontrado', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
