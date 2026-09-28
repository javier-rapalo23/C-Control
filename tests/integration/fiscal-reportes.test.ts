import { prisma } from '@/lib/prisma';
import { anularDocumentoFiscal, emitirDocumentoFiscal } from '@/lib/fiscal-document';
import { getFiscalBookReport, getFiscalPendingReport } from '@/lib/fiscal-reports';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * Los reportes fiscales contra Postgres de verdad.
 *
 * Las pruebas unitarias usan un doble de Prisma, así que fijan los totales y los
 * huecos de numeración pero **no** las consultas. Lo que se verifica acá es
 * justamente eso: que `fiscalDocument: { is: null }` encuentre las transacciones sin
 * documento, que el filtro por tipo separe los dos libros, y que un documento anulado
 * de verdad —emitido y anulado por las funciones reales— salga en el libro sin sumar.
 *
 * Se salta sin `.env.test`.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SUFIJO = `reportes-${Date.now()}`;
const HOY = new Date(`${todayBusinessDate()}T00:00:00.000Z`);

/** Igual que en la suite de emisión: `numeroCompleto` es único en toda la base. */
const ESTABLECIMIENTO = String(Math.floor(Math.random() * 900) + 100);
const PUNTO_EMISION = String(Math.floor(Math.random() * 900) + 100);

let siguienteBloque = 1;
function reservarBloque(tamano = 1_000) {
  const desde = siguienteBloque;
  siguienteBloque += tamano;
  return { rangoDesde: desde, rangoHasta: desde + tamano - 1, ultimoCorrelativo: desde - 1 };
}

const PREFIJO_CAI = 'CAI-reportes-';
const PREFIJO_BODEGA = 'Bodega reportes-';
const PREFIJO_CLIENTE = 'Cliente reportes-';
const PREFIJO_PRODUCTO = 'Café reportes-';

/** Se llama antes y después, por lo mismo que en `fiscal-emision.test.ts`. */
async function limpiarRastros() {
  const cais = await prisma.fiscalCai.findMany({
    where: { codigo: { startsWith: PREFIJO_CAI } },
    select: { id: true },
  });
  const caiIds = cais.map((cai) => cai.id);

  if (caiIds.length > 0) {
    // La bitácora no tiene llaves foráneas (así se diseñó, para que sobreviva a lo que
    // se borre), así que se limpia aparte y antes.
    await prisma.fiscalAuditLog.deleteMany({ where: { caiId: { in: caiIds } } });
  }

  // Interactiva y no en lote: el borrado del CAI tiene que llegar después del de sus
  // documentos, contra el `RESTRICT`.
  await prisma.$transaction(async (tx) => {
    await tx.fiscalDocument.deleteMany({ where: { cai: { codigo: { startsWith: PREFIJO_CAI } } } });
    await tx.fiscalCai.deleteMany({ where: { codigo: { startsWith: PREFIJO_CAI } } });
  });

  const sucursales = await prisma.sucursal.findMany({
    where: { nombre: { startsWith: PREFIJO_BODEGA } },
    select: { id: true },
  });
  const sucursalIds = sucursales.map((sucursal) => sucursal.id);

  if (sucursalIds.length > 0) {
    const where = { sucursalId: { in: sucursalIds } };
    await prisma.sale.deleteMany({ where });
    await prisma.saleTransaction.deleteMany({ where });
    await prisma.purchase.deleteMany({ where });
    await prisma.purchaseTransaction.deleteMany({ where });
    await prisma.grindingService.deleteMany({ where });
    await prisma.dailyBalance.deleteMany({ where });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
  }

  await prisma.producto.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRODUCTO } } });
  await prisma.client.deleteMany({ where: { nombre: { startsWith: PREFIJO_CLIENTE } } });
}

conBase('reportes fiscales', () => {
  const hoy = todayBusinessDate();
  const rango = { from: hoy, to: hoy };

  let sucursalId = '';
  let clientId = '';
  let productoId = '';
  /** Código del CAI de compras de esta corrida: aísla el libro de otros rastros. */
  let caiCompras = '';

  beforeAll(async () => {
    await limpiarRastros();

    const sucursal = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}` } });
    const cliente = await prisma.client.create({
      data: { nombre: `Cliente ${SUFIJO}`, rtn: '0801-1990-999999' },
    });
    const producto = await prisma.producto.create({
      data: { nombre: `Café ${SUFIJO}`, categoria: 'pergamino', clasificacionFiscal: 'EXENTO' },
    });
    sucursalId = sucursal.id;
    clientId = cliente.id;
    productoId = producto.id;
  });

  afterAll(async () => {
    await limpiarRastros();
    await prisma.$disconnect();
  });

  async function crearCaiActivo(tipoDocumento: string) {
    await prisma.fiscalCai.updateMany({ where: { tipoDocumento, estado: 'activo' }, data: { estado: 'inactivo' } });
    return prisma.fiscalCai.create({
      data: {
        tipoDocumento,
        codigo: `${PREFIJO_CAI}${Math.random().toString(36).slice(2, 8)}`,
        codigoEstablecimiento: ESTABLECIMIENTO,
        codigoPuntoEmision: PUNTO_EMISION,
        codigoTipoDocumento: tipoDocumento === 'factura' ? '01' : '04',
        ...reservarBloque(),
        fechaLimite: new Date('2027-12-31T00:00:00.000Z'),
        modo: 'SISTEMA',
        estado: 'activo',
      },
    });
  }

  async function crearCompra(total = 2_000) {
    return prisma.purchaseTransaction.create({
      data: {
        businessDate: HOY,
        sucursalId,
        clientId,
        total,
        items: {
          create: [
            {
              businessDate: HOY,
              sucursalId,
              productoId,
              productoNombre: `Café ${SUFIJO}`,
              precioPorLibra: 20,
              libras: 100,
              total,
            },
          ],
        },
      },
    });
  }

  const crearVenta = (total = 1_000) =>
    prisma.saleTransaction.create({ data: { businessDate: HOY, sucursalId, clientId, total } });

  const crearMolido = (monto = 150) =>
    prisma.grindingService.create({
      data: { businessDate: HOY, sucursalId, clientId, libras: 50, monto, registradoPor: 'tester' },
    });

  it('el libro de compras trae el documento emitido con los datos del snapshot', async () => {
    const cai = await crearCaiActivo('boleta_compra');
    caiCompras = cai.codigo;
    const compra = await crearCompra(2_000);

    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'compra',
      transactionId: compra.id,
      usuario: 'tester',
    });

    const libro = await getFiscalBookReport(prisma, { libro: 'compras', ...rango });
    const fila = libro.rows.find((row) => row.id === documento.id);

    expect(fila).toBeDefined();
    expect(fila).toMatchObject({
      numeroCompleto: documento.numeroCompleto,
      tipoDocumento: 'boleta_compra',
      origen: 'compra',
      clienteNombre: `Cliente ${SUFIJO}`,
      clienteRtn: '0801-1990-999999',
      total: 2_000,
      importeExento: 2_000,
      anulado: false,
      fechaEmision: hoy,
    });
    // El correlativo interno se imprime en el papel y es el puente con el libro.
    expect(fila?.numeroInterno).toBe(`C-${String(compra.numeroInterno).padStart(6, '0')}`);
  });

  // Una boleta de compra en el libro de ventas sería declarar una venta que no existe.
  it('cada libro trae solo su tipo de documento', async () => {
    const libroVentas = await getFiscalBookReport(prisma, { libro: 'ventas', ...rango });

    expect(libroVentas.rows.some((row) => row.caiCodigo === caiCompras)).toBe(false);
    expect(libroVentas.rows.every((row) => row.tipoDocumento === 'factura')).toBe(true);
  });

  it('un documento anulado aparece en el libro y no suma', async () => {
    const cai = await crearCaiActivo('factura');
    const venta = await crearVenta(3_000);

    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: venta.id,
      usuario: 'tester',
    });
    await anularDocumentoFiscal(prisma, {
      id: documento.id,
      usuario: 'tester',
      motivo: 'Prueba de reportes',
      copiaFisicaUbicacion: 'Archivo de pruebas',
    });

    const libro = await getFiscalBookReport(prisma, { libro: 'ventas', ...rango });
    const mias = libro.rows.filter((row) => row.caiCodigo === cai.codigo);

    expect(mias).toHaveLength(1);
    expect(mias[0]).toMatchObject({ anulado: true, anulacionMotivo: 'Prueba de reportes', total: 3_000 });
    // Los totales del libro son de todo el día, así que se compara el aporte: lo
    // anulado va al acumulado aparte y no al total.
    expect(libro.totals.totalAnulado).toBeGreaterThanOrEqual(3_000);
    expect(libro.totals.anulados).toBeGreaterThanOrEqual(1);
  });

  it('los pendientes de emitir son las transacciones sin documento, y desaparecen al emitir', async () => {
    const [compra, venta, molido] = await Promise.all([crearCompra(500), crearVenta(600), crearMolido(150)]);

    const antes = await getFiscalPendingReport(prisma, { ...rango, sucursalId });
    const ids = antes.rows.map((row) => row.transactionId);

    expect(ids).toContain(compra.id);
    expect(ids).toContain(venta.id);
    expect(ids).toContain(molido.id);
    expect(antes.rows.find((row) => row.transactionId === molido.id)).toMatchObject({
      origen: 'molido',
      numeroInterno: null,
      total: 150,
      clienteNombre: `Cliente ${SUFIJO}`,
    });

    await crearCaiActivo('boleta_compra');
    await emitirDocumentoFiscal(prisma, { origen: 'compra', transactionId: compra.id, usuario: 'tester' });

    const despues = await getFiscalPendingReport(prisma, { ...rango, sucursalId });
    expect(despues.rows.map((row) => row.transactionId)).not.toContain(compra.id);
    expect(despues.rows.map((row) => row.transactionId)).toContain(venta.id);
  });

  // La sucursal es el filtro con el que cada bodega ve lo suyo.
  it('los pendientes se pueden limitar a una sucursal', async () => {
    const otra = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}-otra` } });

    const reporte = await getFiscalPendingReport(prisma, { ...rango, sucursalId: otra.id });

    expect(reporte.rows).toEqual([]);
    expect(reporte.totals.documentos).toBe(0);
  });
});
