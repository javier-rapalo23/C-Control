import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { recalculateDailyBalance } from '@/lib/ledger';

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

      await tx.purchaseTransaction.delete({ where: { id } });
      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10));
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