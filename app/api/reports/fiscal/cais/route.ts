import type { NextRequest } from 'next/server';
import { handleApiError, success } from '@/lib/api-response';
import { listFiscalCais } from '@/lib/fiscal-cai';
import { caiStatusSheets } from '@/lib/report-exports';
import { buildWorkbook, xlsxResponse } from '@/lib/xlsx';
import { pideXlsx } from '@/lib/report-download';
import { prisma } from '@/lib/prisma';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * Estado de los CAI, para la pestaña Fiscal de Reportes.
 *
 * Los mismos datos que `GET /api/fiscal-cais`, que es de Mantenimiento, pero por acá
 * porque son datos de reporte: piden el módulo `reports`, igual que el libro y los
 * pendientes, y se pueden exportar.
 *
 * No lleva rango de fechas: el estado del rango es el de hoy, no el de un período.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiModuleAccess(request, 'reports');

    const cais = await listFiscalCais(prisma);
    const { searchParams } = new URL(request.url);

    if (pideXlsx(searchParams)) {
      return xlsxResponse(`estado-cai-${todayBusinessDate()}.xlsx`, await buildWorkbook(caiStatusSheets(cais)));
    }

    return success(cais);
  } catch (error) {
    return handleApiError(error);
  }
}
