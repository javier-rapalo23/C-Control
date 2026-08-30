import { handleApiError, success } from '@/lib/api-response';
import { getSaleReport, type PurchaseReportGroupBy } from '@/lib/reports';
import { prisma } from '@/lib/prisma';
import { endOfBusinessWeek, startOfBusinessWeek, todayBusinessDate } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupByParam = searchParams.get('groupBy');
    const groupBy: PurchaseReportGroupBy = groupByParam === 'week' ? 'week' : 'day';

    // Sin rango explícito, la semana en curso: es el caso de uso más frecuente.
    const today = todayBusinessDate();
    const from = searchParams.get('from') ?? startOfBusinessWeek(today);
    const to = searchParams.get('to') ?? endOfBusinessWeek(today);

    const report = await getSaleReport(prisma, {
      from,
      to,
      groupBy,
      sucursalId: searchParams.get('sucursalId'),
    });

    return success(report);
  } catch (error) {
    return handleApiError(error);
  }
}
