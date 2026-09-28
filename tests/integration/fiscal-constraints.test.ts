import { prisma } from '@/lib/prisma';

/**
 * Las defensas que viven en la base, no en el código: son las que siguen en pie el
 * día que una ruta nueva olvide comprobar algo.
 *
 * Solo se pueden verificar contra Postgres de verdad (índice parcial, CHECK y
 * RESTRICT), así que esta suite es de integración y se salta sin `.env.test`.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SUFIJO = `test-${Date.now()}`;

/**
 * Tipo propio para esta suite: el índice parcial es por tipo de documento, así que
 * usar `factura` la haría pelear con la suite de emisión por el único CAI activo.
 */
const TIPO = 'nota_credito';

async function crearCai(overrides: Record<string, unknown> = {}) {
  return prisma.fiscalCai.create({
    data: {
      tipoDocumento: TIPO,
      codigo: `CAI-${SUFIJO}-${Math.random().toString(36).slice(2, 8)}`,
      codigoEstablecimiento: '001',
      codigoPuntoEmision: '001',
      codigoTipoDocumento: '01',
      rangoDesde: 1,
      rangoHasta: 100,
      fechaLimite: new Date('2026-12-31T00:00:00.000Z'),
      ...overrides,
    },
  });
}

conBase('restricciones de la base — facturación fiscal', () => {
  const creados = { cais: [] as string[], documentos: [] as string[], ventas: [] as string[] };
  // La suite crea su propia sucursal y su propio cliente: depender de que la base de
  // pruebas ya tenga datos dejaba la parte importante sin ejecutarse en una base vacía.
  let sucursalId = '';
  let clientId = '';

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}` } });
    const cliente = await prisma.client.create({ data: { nombre: `Cliente ${SUFIJO}` } });
    sucursalId = sucursal.id;
    clientId = cliente.id;
  });

  afterEach(async () => {
    await prisma.fiscalDocument.deleteMany({ where: { id: { in: creados.documentos } } });
    await prisma.saleTransaction.deleteMany({ where: { id: { in: creados.ventas } } });
    await prisma.fiscalCai.deleteMany({ where: { id: { in: creados.cais } } });
    creados.documentos = [];
    creados.ventas = [];
    creados.cais = [];
  });

  afterAll(async () => {
    // Los documentos primero: el RESTRICT que esta suite comprueba también impide
    // borrar las ventas mientras exista el documento que las referencia.
    await prisma.fiscalDocument.deleteMany({ where: { cai: { tipoDocumento: TIPO } } });
    await prisma.fiscalCai.deleteMany({ where: { tipoDocumento: TIPO } });
    await prisma.saleTransaction.deleteMany({ where: { sucursalId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.sucursal.deleteMany({ where: { id: sucursalId } });
    await prisma.$disconnect();
  });

  async function crearVenta() {
    const venta = await prisma.saleTransaction.create({
      data: {
        businessDate: new Date('2026-09-27T00:00:00.000Z'),
        sucursalId,
        clientId,
        total: 0,
      },
    });
    creados.ventas.push(venta.id);
    return venta;
  }

  it('no permite dos CAI activos del mismo tipo de documento', async () => {
    const primero = await crearCai({ estado: 'activo' });
    creados.cais.push(primero.id);

    // El índice parcial es lo que impide que la emisión tenga que elegir entre dos.
    await expect(crearCai({ estado: 'activo' })).rejects.toThrow();

    // Inactivo sí: el historial de CAI agotados tiene que poder convivir.
    const inactivo = await crearCai({ estado: 'inactivo' });
    creados.cais.push(inactivo.id);
    expect(inactivo.estado).toBe('inactivo');
  });

  it('rechaza un rango al revés y un contador fuera del rango', async () => {
    await expect(crearCai({ rangoDesde: 100, rangoHasta: 1 })).rejects.toThrow();
    await expect(crearCai({ rangoHasta: 50, ultimoCorrelativo: 51 })).rejects.toThrow();
  });

  it('exige que el documento ampare exactamente una transacción', async () => {
    const cai = await crearCai({ estado: 'inactivo' });
    creados.cais.push(cai.id);

    const base = {
      caiId: cai.id,
      tipoDocumento: TIPO,
      correlativo: 1,
      numeroCompleto: `001-001-01-${SUFIJO}`,
      businessDate: new Date('2026-09-27T00:00:00.000Z'),
      emitidoPor: 'tester',
      total: 100,
      snapshot: {},
      formatoVersion: '1',
    };

    // Sin ninguna referencia: el documento no ampararía nada.
    await expect(prisma.fiscalDocument.create({ data: base })).rejects.toThrow();

    // Con dos: ampararía una compra y una venta a la vez, y el total no podría
    // corresponder a las dos.
    const venta = await crearVenta();
    const compras = await prisma.purchaseTransaction.create({
      data: { businessDate: base.businessDate, sucursalId, clientId, total: 0 },
    });

    await expect(
      prisma.fiscalDocument.create({
        data: { ...base, saleTransactionId: venta.id, purchaseTransactionId: compras.id },
      }),
    ).rejects.toThrow();

    await prisma.purchaseTransaction.delete({ where: { id: compras.id } });
  });

  it('no deja dos documentos con el mismo correlativo en un CAI', async () => {
    const cai = await crearCai({ estado: 'inactivo' });
    creados.cais.push(cai.id);

    const primeraVenta = await crearVenta();
    const segundaVenta = await crearVenta();

    const documento = await prisma.fiscalDocument.create({
      data: {
        caiId: cai.id,
        tipoDocumento: TIPO,
        correlativo: 7,
        numeroCompleto: `001-001-01-${SUFIJO}-7`,
        businessDate: new Date('2026-09-27T00:00:00.000Z'),
        emitidoPor: 'tester',
        saleTransactionId: primeraVenta.id,
        total: 0,
        snapshot: {},
        formatoVersion: '1',
      },
    });
    creados.documentos.push(documento.id);

    await expect(
      prisma.fiscalDocument.create({
        data: {
          caiId: cai.id,
          tipoDocumento: TIPO,
          correlativo: 7,
          numeroCompleto: `001-001-01-${SUFIJO}-7-bis`,
          businessDate: new Date('2026-09-27T00:00:00.000Z'),
          emitidoPor: 'tester',
          saleTransactionId: segundaVenta.id,
          total: 0,
          snapshot: {},
          formatoVersion: '1',
        },
      }),
    ).rejects.toThrow();

    // Y lo que protege el criterio 9.4: la venta documentada no se puede borrar,
    // aunque nadie haya llamado a la comprobación de la aplicación.
    await expect(prisma.saleTransaction.delete({ where: { id: primeraVenta.id } })).rejects.toThrow();

    // El documento se borra acá porque el `afterEach` no podría: la venta que
    // referencia está protegida por el RESTRICT que acaba de comprobarse.
    await prisma.fiscalDocument.delete({ where: { id: documento.id } });
    creados.documentos = [];
  });
});
