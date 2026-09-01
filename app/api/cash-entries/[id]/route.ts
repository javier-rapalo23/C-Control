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
      const existing = await tx.cashEntry.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const businessDate = toBusinessDateString(existing.businessDate);
      await assertCashOpen(tx, businessDate, existing.sucursalId);

      await tx.cashEntry.delete({ where: { id } });
      await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Ingreso de efectivo no encontrado', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
