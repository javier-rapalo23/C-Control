import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { getPurchaseReport } from '@/lib/reports';
import { purchaseReportSheets } from '@/lib/report-exports';
import { buildWorkbook } from '@/lib/xlsx';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * El Excel de un reporte, armado desde datos reales.
 *
 * Las pruebas unitarias parten de un DTO escrito a mano; acá el reporte lo calcula la
 * consulta de verdad, así que lo que se verifica es la cadena completa: compra guardada →
 * reporte → libro de Excel. Es lo que atrapa un desajuste entre lo que devuelve la
 * consulta y lo que las hojas esperan encontrar.
 *
 * Se salta sin `.env.test`.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SUFIJO = `xlsx-${Date.now()}`;
const HOY = new Date(`${todayBusinessDate()}T00:00:00.000Z`);

const PREFIJO_BODEGA = 'Bodega xlsx-';
const PREFIJO_CLIENTE = 'Cliente xlsx-';
const PREFIJO_PRODUCTO = 'Café xlsx-';

async function limpiarRastros() {
  const sucursales = await prisma.sucursal.findMany({
    where: { nombre: { startsWith: PREFIJO_BODEGA } },
    select: { id: true },
  });
  const sucursalIds = sucursales.map((sucursal) => sucursal.id);

  if (sucursalIds.length > 0) {
    const where = { sucursalId: { in: sucursalIds } };
    await prisma.purchase.deleteMany({ where });
    await prisma.purchaseTransaction.deleteMany({ where });
    await prisma.dailyBalance.deleteMany({ where });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
  }

  await prisma.producto.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRODUCTO } } });
  await prisma.client.deleteMany({ where: { nombre: { startsWith: PREFIJO_CLIENTE } } });
}

conBase('Excel de los reportes', () => {
  const hoy = todayBusinessDate();
  let sucursalId = '';

  beforeAll(async () => {
    await limpiarRastros();

    const sucursal = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}` } });
    const cliente = await prisma.client.create({ data: { nombre: `Cliente ${SUFIJO}` } });
    const producto = await prisma.producto.create({ data: { nombre: `Café ${SUFIJO}`, categoria: 'pergamino' } });
    sucursalId = sucursal.id;

    await prisma.purchaseTransaction.create({
      data: {
        businessDate: HOY,
        sucursalId,
        clientId: cliente.id,
        total: 2_200,
        items: {
          create: [
            {
              businessDate: HOY,
              sucursalId,
              productoId: producto.id,
              productoNombre: `Café ${SUFIJO}`,
              precioPorLibra: 22,
              libras: 100,
              total: 2_200,
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await limpiarRastros();
    await prisma.$disconnect();
  });

  it('el libro de compras se arma con los datos de la consulta real', async () => {
    const report = await getPurchaseReport(prisma, { from: hoy, to: hoy, groupBy: 'day', sucursalId });
    const buffer = await buildWorkbook(purchaseReportSheets(report));

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Totales', 'Por día', 'Por producto', 'Por cliente']);

    // El total de la hoja es el de la consulta, como número: es lo que se suma en Excel.
    const totales = libro.getWorksheet('Totales')!;
    expect(totales.getRow(3).getCell(1).value).toBe('Total pagado');
    expect(totales.getRow(3).getCell(2).value).toBe(2_200);

    // Y el desglose trae el producto que se compró, no una fila vacía.
    const porProducto = libro.getWorksheet('Por producto')!;
    expect(porProducto.getRow(4).getCell(1).value).toBe(`Café ${SUFIJO}`);
    expect(porProducto.getRow(4).getCell(2).value).toBe(100);
  });
});
