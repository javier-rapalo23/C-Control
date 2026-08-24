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

    const existing = await prisma.employeePayment.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Pago no encontrado', 404);
    }

    await prisma.$transaction(async (tx) => {
      const businessDate = toBusinessDateString(existing.businessDate);

      if (existing.sucursalId) {
        await assertCashOpen(tx, businessDate, existing.sucursalId);
      }

      // Se devuelve a cada adelanto exactamente lo que ESTE pago le descontó, no
      // todo `montoAplicado`: otras planillas pueden haber aportado su parte.
      const applications = await tx.payrollAdvanceApplication.findMany({ where: { paymentId: id } });
      for (const application of applications) {
        await tx.employeeAdvance.update({
          where: { id: application.advanceId },
          data: { montoAplicado: { decrement: application.monto } },
        });
      }

      // Las aplicaciones caen en cascada con el pago.
      await tx.employeePayment.delete({ where: { id } });

      // El gasto asociado es propiedad del pago: se va con él y el saldo se rehace.
      if (existing.expenseId) {
        await tx.expense.delete({ where: { id: existing.expenseId } });
        if (existing.sucursalId) {
          await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
        }
      }
    });

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
