import { createExpenseSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { parseBusinessDate } from '@/lib/business-date';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';

export async function POST(request: Request) {
  try {
    const payload = createExpenseSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      const created = await tx.expense.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          categoria: payload.categoria,
          bancoId: payload.bancoId ?? null,
          descripcion: payload.descripcion,
          monto: payload.monto,
        },
        include: { banco: { select: { nombre: true } } },
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    const { banco, ...expense } = result;

    return success(
      {
        ...expense,
        businessDate: expense.businessDate.toISOString().slice(0, 10),
        bancoNombre: banco?.nombre ?? null,
        monto: Number(expense.monto),
        createdAt: expense.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}