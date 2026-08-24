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

    // Los gastos de planilla los posee el pago o anticipo que los generó: borrarlos
    // desde aquí dejaría ese registro sin su contrapartida en caja.
    const owned = await prisma.expense.findUnique({
      where: { id },
      select: { employeePayment: { select: { id: true } }, employeeAdvance: { select: { id: true } } },
    });
    if (owned?.employeePayment || owned?.employeeAdvance) {
      return failure(
        'CONFLICT',
        'Este gasto lo generó un pago o anticipo de personal. Elimínelo desde el módulo Personal.',
        409,
      );
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      await assertCashOpen(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);

      await tx.expense.delete({ where: { id } });
      await recalculateDailyBalance(tx, existing.businessDate.toISOString().slice(0, 10), existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Expense not found', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}