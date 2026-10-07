import ExcelJS from 'exceljs';
import { XLSX_CONTENT_TYPE } from '@/lib/xlsx';

/**
 * Las rutas de reporte con `formato=xlsx`, ejecutadas directamente como hace el resto de
 * `tests/api`: sin levantar servidor, con un `Request` estándar y `@/lib/prisma` doblado.
 *
 * Lo que se verifica es el contrato de la descarga —tipo de contenido, nombre del archivo
 * y que el cuerpo sea un .xlsx que se puede abrir— porque es lo que decide si al usuario
 * le llega un archivo o una pantalla de error.
 */

const reporte = {
  from: '2026-09-01',
  to: '2026-09-30',
  groupBy: 'day' as const,
  sucursalId: 'suc-1',
  totals: { totalLibras: 100, totalQuintalesOro: 1, totalLempiras: 2_200, numeroCompras: 1, promedioPorLibra: 22 },
  periods: [
    {
      inicio: '2026-09-01',
      fin: '2026-09-01',
      label: '2026-09-01',
      totalLibras: 100,
      totalQuintalesOro: 1,
      totalLempiras: 2_200,
      numeroCompras: 1,
    },
  ],
  porProducto: [
    { id: 'p1', nombre: 'Pergamino seco', totalLibras: 100, totalQuintalesOro: 1, totalLempiras: 2_200, numeroCompras: 1 },
  ],
  porCliente: [
    { id: 'c1', nombre: 'Juan Pérez', totalLibras: 100, totalQuintalesOro: 1, totalLempiras: 2_200, numeroCompras: 1 },
  ],
  porClienteProducto: [],
};

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/reports', () => ({
  getPurchaseReport: jest.fn(async () => reporte),
}));

import { GET } from '@/app/api/reports/purchases/route';

describe('GET /api/reports/purchases?formato=xlsx', () => {
  it('devuelve un .xlsx descargable con una hoja por tabla', async () => {
    const response = await GET(
      new Request('http://localhost/api/reports/purchases?from=2026-09-01&to=2026-09-30&formato=xlsx'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(XLSX_CONTENT_TYPE);
    // El nombre lleva el período: así dos descargas de rangos distintos no se pisan.
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="compras-2026-09-01-a-2026-09-30.xlsx"',
    );
    // Y no se cachea: el reporte cambia con cada compra registrada.
    expect(response.headers.get('cache-control')).toBe('no-store');

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await response.arrayBuffer());
    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Totales', 'Por día', 'Por producto', 'Por cliente', 'Cliente y tipo de café']);
  });

  // Sin el parámetro sigue siendo la API de siempre: el panel la consume como JSON.
  it('sin formato=xlsx devuelve el JSON de siempre', async () => {
    const response = await GET(new Request('http://localhost/api/reports/purchases?from=2026-09-01&to=2026-09-30'));
    const body = await response.json();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toMatchObject({ ok: true, data: { totals: { totalLempiras: 2_200 } } });
  });
});
