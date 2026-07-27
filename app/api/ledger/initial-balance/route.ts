import { setInitialBalanceSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { ensureDailyBalance, getLedgerByDate, resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate } from '@/lib/business-date';

export async function POST(request: Request) {
  try {
    const payload = setInitialBalanceSchema.parse(await request.json());
    const sucursalId = await resolveSucursalId(prisma, payload.sucursalId);

    await prisma.$transaction(async (tx) => {
      const balance = await ensureDailyBalance(tx, payload.businessDate, sucursalId);

      await tx.dailyBalance.update({
        where: { id: balance.id },
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          saldoInicial: payload.saldoInicial,
        },
      });
    });

    const ledger = await getLedgerByDate(prisma, payload.businessDate, sucursalId);
    return success(ledger);
  } catch (error) {
    return handleApiError(error);
  }
}