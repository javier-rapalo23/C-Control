import { buildWorkbook, xlsxResponse, type Sheet, type TotalesSheet } from '@/lib/xlsx';

/**
 * Convierte un reporte ya calculado en la respuesta de descarga.
 *
 * Existe para que las rutas no repitan seis veces el mismo bloque —armar el libro, poner
 * el nombre del archivo, devolver la respuesta— y para que el nombre del archivo siga una
 * sola regla: `<reporte>-<desde>-a-<hasta>.xlsx`, que es lo que hace que varios períodos
 * se puedan guardar en la misma carpeta sin pisarse.
 */
export async function xlsxReportResponse(
  nombre: string,
  rango: { from: string; to: string },
  hojas: Array<Sheet<never> | TotalesSheet>,
): Promise<Response> {
  return xlsxResponse(`${nombre}-${rango.from}-a-${rango.to}.xlsx`, await buildWorkbook(hojas));
}

/** `true` cuando la petición pide el archivo en vez del JSON. */
export function pideXlsx(searchParams: URLSearchParams): boolean {
  return searchParams.get('formato') === 'xlsx';
}
