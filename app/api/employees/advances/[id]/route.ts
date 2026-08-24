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

    const existing = await prisma.employeeAdvance.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      return failure('NOT_FOUND', 'Anticipo no encontrado', 404);
    }

    // Un anticipo ya descontado en una planilla no puede borrarse sin más: al
    // desaparecer, el neto que se pagó dejaría de tener explicación.
    if (existing.applications.length > 0) {
      return failure(
        'CONFLICT',
        'Este anticipo ya fue descontado en una planilla. Elimine primero ese pago de planilla.',
        409,
      );
    }

    await prisma.$transaction(async (tx) => {
      const businessDate = toBusinessDateString(existing.businessDate);

      if (existing.sucursalId) {
        await assertCashOpen(tx, businessDate, existing.sucursalId);
      }

      await tx.employeeAdvance.delete({ where: { id } });

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
