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
      const existing = await tx.saleTransaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        return null;
      }

      await assertSinDocumentoFiscal(tx, 'venta', id);
      // Los abonos ya recibidos quedarían sin venta a la que aplicarse.
      if ((await totalAbonadoVenta(tx, id)).gt(0)) {
        throw new ReceivableError(
          'Esta venta tiene abonos registrados: elimínalos primero en Cuentas por cobrar.',
          409,
          'CONFLICT',
        );
      }
      await assertCashOpen(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);

      await tx.saleTransaction.delete({ where: { id } });
      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Sale transaction not found', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    if (error instanceof ReceivableError) {
      return failure(error.code, error.message, error.status);
    }
    return handleApiError(error);
  }
}
