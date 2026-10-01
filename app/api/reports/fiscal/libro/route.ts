import type { NextRequest } from 'next/server';
import { handleApiError, success } from '@/lib/api-response';
import { buildCsv, csvResponse } from '@/lib/csv';
import { fiscalBookCsvColumns, getFiscalBookReport, isFiscalBookKind } from '@/lib/fiscal-reports';
import { fiscalBookSheets } from '@/lib/report-exports';
import { pideXlsx, xlsxReportResponse } from '@/lib/report-download';
import { prisma } from '@/lib/prisma';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * Libro de compras y libro de ventas.
 *
 * Se comprueba el permiso del módulo de Reportes aunque el middleware ya exija sesión:
 * este endpoint entrega el detalle fiscal completo del período en un archivo
 * descargable, y quien no puede abrir la página de reportes tampoco debería poder
 * pedirlo por URL.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiModuleAccess(request, 'reports');

    const { searchParams } = new URL(request.url);
    const libroParam = searchParams.get('libro');
    const libro = isFiscalBookKind(libroParam) ? libroParam : 'compras';

    // Sin rango explícito, el mes en curso: la declaración del ISV es mensual, así que
    // es el período con el que se trabaja el libro.
    const hoy = todayBusinessDate();
    const from = searchParams.get('from') ?? `${hoy.slice(0, 7)}-01`;
    const to = searchParams.get('to') ?? hoy;

    const report = await getFiscalBookReport(prisma, { libro, from, to });

    if (pideXlsx(searchParams)) {
      return xlsxReportResponse(`libro-${libro}`, report, fiscalBookSheets(report));
    }

    // El CSV se mantiene además del Excel: es el formato que se puede cargar en otro
    // sistema contable, y el libro es justo lo que se lleva de un sistema a otro.
    if (searchParams.get('formato') === 'csv') {
      return csvResponse(`libro-${libro}-${from}-a-${to}.csv`, buildCsv(fiscalBookCsvColumns, report.rows));
    }

    return success(report);
  } catch (error) {
    return handleApiError(error);
  }
}
