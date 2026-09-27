import { Prisma } from '@prisma/client';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
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

      await assertCashOpen(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);

      // Toda compra pertenece a una transacción, así que siempre hay cabecera que
      // ajustar: se recalcula su total, o se elimina si esta era su última línea.
      const transactionId = existing.purchaseTransactionId;
      await tx.purchase.delete({ where: { id } });

      const remainingItems = await tx.purchase.findMany({
        where: { purchaseTransactionId: transactionId },
        orderBy: { createdAt: 'asc' },
      });

      if (remainingItems.length === 0) {
        await tx.purchaseTransaction.delete({ where: { id: transactionId } });
      } else {
        // El bono y el descuento son de la compra completa y sobreviven a que se
        // borre una línea: rehacer el total sin ellos le pagaría de más al productor.
        const cabecera = await tx.purchaseTransaction.findUniqueOrThrow({ where: { id: transactionId } });
        const subtotal = remainingItems.reduce(
          (accumulator, item) => accumulator.add(item.total),
          new Prisma.Decimal(0),
        );
        const total = subtotal.add(cabecera.bono).sub(cabecera.descuento);
        await tx.purchaseTransaction.update({
          where: { id: transactionId },
          data: { total: total.isNegative() ? new Prisma.Decimal(0) : total },
        });
      }

      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);
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