import { Prisma } from '@prisma/client';
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
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const transactionId = existing.purchaseTransactionId;
      await tx.purchase.delete({ where: { id } });

      if (transactionId) {
        const remainingItems = await tx.purchase.findMany({
          where: { purchaseTransactionId: transactionId },
          orderBy: { createdAt: 'asc' },
        });

        if (remainingItems.length === 0) {
          await tx.purchaseTransaction.delete({ where: { id: transactionId } });
        } else {
          const total = remainingItems.reduce((accumulator, item) => accumulator.add(item.total), new Prisma.Decimal(0));
          await tx.purchaseTransaction.update({
            where: { id: transactionId },
            data: { total },
          });
        }
      }

      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10));
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Purchase not found', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}