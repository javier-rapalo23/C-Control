import { Prisma } from '@prisma/client';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance } from '@/lib/ledger';
import { assertSinDocumentoFiscal } from '@/lib/fiscal-document';
import { ReceivableError, totalAbonadoVenta } from '@/lib/receivables';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const businessDate = existing.businessDate.toISOString().slice(0, 10);
      // Igual que en compras: borrar una línea cambia el total ya documentado.
      await assertSinDocumentoFiscal(tx, 'venta', existing.saleTransactionId);
      await assertCashOpen(tx, businessDate, existing.sucursalId);

      // Toda venta pertenece a una transacción, así que siempre hay cabecera que
      // ajustar: se recalcula su total, o se elimina si esta era su última línea.
      // Sin esto quedaba una cabecera con un total que ya no correspondía a sus
      // líneas, o vacía por completo.
      const transactionId = existing.saleTransactionId;
      await tx.sale.delete({ where: { id } });

      const remainingItems = await tx.sale.findMany({
        where: { saleTransactionId: transactionId },
        orderBy: { createdAt: 'asc' },
      });

      const total = remainingItems.reduce((accumulator, item) => accumulator.add(item.monto), new Prisma.Decimal(0));
      // En una venta a crédito el total no puede quedar por debajo de lo ya abonado:
      // el estado de cuenta mostraría un saldo a favor que nadie registró.
      const abonado = await totalAbonadoVenta(tx, transactionId);
      if (abonado.gt(total)) {
        throw new ReceivableError(
          `La venta ya tiene L ${abonado.toFixed(2)} abonados: elimina los abonos antes de quitar esta línea.`,
          409,
          'CONFLICT',
        );
      }

      if (remainingItems.length === 0) {
        await tx.saleTransaction.delete({ where: { id: transactionId } });
      } else {
        await tx.saleTransaction.update({ where: { id: transactionId }, data: { total } });
      }

      await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Sale not found', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    if (error instanceof ReceivableError) {
      return failure(error.code, error.message, error.status);
    }
    return handleApiError(error);
  }
}
