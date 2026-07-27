import { failure, handleApiError, success } from '@/lib/api-response';
import { getLedgerByDate, resolveSucursalId } from '@/lib/ledger';
import { prisma } from '@/lib/prisma';
import { todayBusinessDate } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate') ?? todayBusinessDate();
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));

    if (!businessDate) {
      return failure('MISSING_QUERY', 'businessDate query param is required', 400);
    }

    const ledger = await getLedgerByDate(prisma, businessDate, sucursalId);
    return success(ledger);
  } catch (error) {
    return handleApiError(error);
  }
}