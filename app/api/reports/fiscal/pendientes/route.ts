import type { NextRequest } from 'next/server';
import { handleApiError, success } from '@/lib/api-response';
import { buildCsv, csvResponse } from '@/lib/csv';
import { fiscalPendingCsvColumns, getFiscalPendingReport } from '@/lib/fiscal-reports';
import { prisma } from '@/lib/prisma';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * Compras, ventas y molidos del período que todavía no tienen documento fiscal.
 *
 * Mismo criterio de permiso que el libro: es el detalle de las operaciones del
 * período, con cliente y monto.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiModuleAccess(request, 'reports');

    const { searchParams } = new URL(request.url);

    // El mes en curso, igual que el libro: es contra el cierre del mes que interesa
    // saber qué quedó sin emitir.
    const hoy = todayBusinessDate();
    const from = searchParams.get('from') ?? `${hoy.slice(0, 7)}-01`;
    const to = searchParams.get('to') ?? hoy;

    const report = await getFiscalPendingReport(prisma, {
      from,
      to,
      sucursalId: searchParams.get('sucursalId'),
    });

    if (searchParams.get('formato') === 'csv') {
      return csvResponse(`pendientes-de-emitir-${from}-a-${to}.csv`, buildCsv(fiscalPendingCsvColumns, report.rows));
    }

    return success(report);
  } catch (error) {
    return handleApiError(error);
  }
}
