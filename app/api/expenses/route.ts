import { createExpenseSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate } from '@/lib/business-date';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';

export async function POST(request: Request) {
  try {
    const payload = createExpenseSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);

      const created = await tx.expense.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          categoria: payload.categoria,
          descripcion: payload.descripcion,
          monto: payload.monto,
        },
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    return success(
      {
        ...result,
        businessDate: result.businessDate.toISOString().slice(0, 10),
        monto: Number(result.monto),
        createdAt: result.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}