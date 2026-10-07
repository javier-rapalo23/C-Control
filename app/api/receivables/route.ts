import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { todayBusinessDate } from '@/lib/business-date';
import { getReceivablesSummary } from '@/lib/receivables';

/** Clientes con saldo por cobrar, del que más debe al que menos. */
export async function GET() {
  try {
    return success(await getReceivablesSummary(prisma, todayBusinessDate()));
  } catch (error) {
    return handleApiError(error);
  }
}
