import { prisma } from '@/lib/prisma';
import { anularDocumentoFiscal, emitirDocumentoFiscal, emitirNotaFiscal } from '@/lib/fiscal-document';
import { getFiscalBookReport } from '@/lib/fiscal-reports';
import { todayBusinessDate } from '@/lib/business-date';

/**
 * Notas de crédito y débito contra Postgres de verdad.
 *
 * Lo que solo se puede comprobar acá: que la nota tome su número de **su propia serie**
 * con el mismo bloqueo de fila, que el techo del saldo se calcule sobre las notas ya
 * guardadas, que los `CHECK` nuevos rechacen una nota mal formada, y que el libro la
 * reste de verdad.
 *
 * Se salta sin `.env.test`.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SUFIJO = `notas-${Date.now()}`;
const HOY = new Date(`${todayBusinessDate()}T00:00:00.000Z`);

/** `numeroCompleto` es único en toda la base: los códigos se sortean por corrida. */
const ESTABLECIMIENTO = String(Math.floor(Math.random() * 900) + 100);
const PUNTO_EMISION = String(Math.floor(Math.random() * 900) + 100);

let siguienteBloque = 1;
function reservarBloque(tamano = 1_000) {
  const desde = siguienteBloque;
  siguienteBloque += tamano;
  return { rangoDesde: desde, rangoHasta: desde + tamano - 1, ultimoCorrelativo: desde - 1 };
}

const PREFIJO_CAI = 'CAI-notas-';
const PREFIJO_BODEGA = 'Bodega notas-';
const PREFIJO_CLIENTE = 'Cliente notas-';

/** Se llama antes y después: un fallo a medias no puede bloquear la corrida siguiente. */
async function limpiarRastros() {
  const cais = await prisma.fiscalCai.findMany({
    where: { codigo: { startsWith: PREFIJO_CAI } },
    select: { id: true },
  });
  const caiIds = cais.map((cai) => cai.id);

  if (caiIds.length > 0) {
    await prisma.fiscalAuditLog.deleteMany({ where: { caiId: { in: caiIds } } });
  }

  // El orden importa dos veces: las notas apuntan a documentos con `RESTRICT`, y los
  // documentos al CAI. Interactiva y no en lote, porque el lote no garantiza el orden.
  await prisma.$transaction(async (tx) => {
    await tx.fiscalDocument.deleteMany({
      where: { documentoOrigen: { cai: { codigo: { startsWith: PREFIJO_CAI } } } },
    });
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
    await prisma.grindingService.deleteMany({ where });
    await prisma.dailyBalance.deleteMany({ where });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
  }

  await prisma.client.deleteMany({ where: { nombre: { startsWith: PREFIJO_CLIENTE } } });
}

conBase('notas de crédito y débito', () => {
  const hoy = todayBusinessDate();
  let sucursalId = '';
  let clientId = '';

  beforeAll(async () => {
    await limpiarRastros();
    const sucursal = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}` } });
    const cliente = await prisma.client.create({ data: { nombre: `Cliente ${SUFIJO}` } });
    sucursalId = sucursal.id;
    clientId = cliente.id;
  });

  afterAll(async () => {
    await limpiarRastros();
    await prisma.$disconnect();
  });

  const CODIGOS_TT: Record<string, string> = { factura: '01', nota_credito: '03', nota_debito: '05' };

  async function crearCaiActivo(tipoDocumento: string) {
    await prisma.fiscalCai.updateMany({ where: { tipoDocumento, estado: 'activo' }, data: { estado: 'inactivo' } });
    return prisma.fiscalCai.create({
      data: {
        tipoDocumento,
        codigo: `${PREFIJO_CAI}${Math.random().toString(36).slice(2, 8)}`,
        codigoEstablecimiento: ESTABLECIMIENTO,
        codigoPuntoEmision: PUNTO_EMISION,
        codigoTipoDocumento: CODIGOS_TT[tipoDocumento] ?? '01',
        ...reservarBloque(),
        fechaLimite: new Date('2027-12-31T00:00:00.000Z'),
        modo: 'SISTEMA',
        estado: 'activo',
      },
    });
  }

  const crearVenta = (total = 3_000) =>
    prisma.saleTransaction.create({ data: { businessDate: HOY, sucursalId, clientId, total } });

  /** Una factura emitida sobre una venta nueva, que es lo que las notas corrigen. */
  async function facturaEmitida(total = 3_000) {
    await crearCaiActivo('factura');
    const venta = await crearVenta(total);
    return emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' });
  }

  it('la nota toma su número de su propia serie y queda ligada al documento', async () => {
    const factura = await facturaEmitida(3_000);
    const cai = await crearCaiActivo('nota_credito');

    const nota = await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 500,
      motivo: 'Café devuelto por humedad',
      usuario: 'tester',
    });

    expect(nota).toMatchObject({
      tipoDocumento: 'nota_credito',
      esNota: true,
      total: 500,
      notaMotivo: 'Café devuelto por humedad',
      estado: 'emitido',
    });
    // Serie propia: el correlativo sale del CAI de la nota, no del de la factura.
    expect(nota.correlativo).toBe(cai.rangoDesde);
    expect(nota.numeroCompleto).toContain(`-${CODIGOS_TT.nota_credito}-`);
    expect(nota.documentoOrigen).toMatchObject({ id: factura.id, numeroCompleto: factura.numeroCompleto });
    // El desglose se hereda del documento corregido: la venta de café está exenta.
    expect(nota.desglose.importeExento).toBe(500);

    // Y el documento corregido ya sabe cuánto le queda.
    const recargado = await prisma.fiscalDocument.findUniqueOrThrow({
      where: { id: factura.id },
      include: { notas: true },
    });
    expect(recargado.notas).toHaveLength(1);

    const libro = await getFiscalBookReport(prisma, { libro: 'ventas', from: hoy, to: hoy });
    const filaNota = libro.rows.find((row) => row.id === nota.id);
    expect(filaNota).toMatchObject({ total: -500, esNota: true, documentoOrigenNumero: factura.numeroCompleto });
  });

  it('no deja acreditar más de lo que queda del documento', async () => {
    const factura = await facturaEmitida(1_000);
    await crearCaiActivo('nota_credito');

    await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 700,
      motivo: 'Primera devolución',
      usuario: 'tester',
    });

    // Quedan 300: pedir 400 devolvería más de lo que se facturó.
    await expect(
      emitirNotaFiscal(prisma, {
        documentoOrigenId: factura.id,
        tipo: 'nota_credito',
        monto: 400,
        motivo: 'Segunda devolución',
        usuario: 'tester',
      }),
    ).rejects.toThrow(/no puede pasar de L 300\.00/);

    // Y 300 justos sí entran.
    const segunda = await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 300,
      motivo: 'Segunda devolución',
      usuario: 'tester',
    });
    expect(segunda.total).toBe(300);
  });

  // La nota de débito sube lo que se cobra, así que no tiene techo y devuelve saldo
  // acreditable.
  it('la nota de débito suma al saldo acreditable', async () => {
    const factura = await facturaEmitida(1_000);
    await crearCaiActivo('nota_debito');

    await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_debito',
      monto: 250,
      motivo: 'Flete no incluido en la factura',
      usuario: 'tester',
    });

    await crearCaiActivo('nota_credito');
    const credito = await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 1_250,
      motivo: 'Se anula la operación completa',
      usuario: 'tester',
    });

    expect(credito.total).toBe(1_250);
  });

  it('no se emite una nota sobre otra nota ni sobre un documento anulado', async () => {
    const factura = await facturaEmitida(500);
    await crearCaiActivo('nota_credito');

    const nota = await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 100,
      motivo: 'Ajuste de peso',
      usuario: 'tester',
    });

    await expect(
      emitirNotaFiscal(prisma, {
        documentoOrigenId: nota.id,
        tipo: 'nota_credito',
        monto: 50,
        motivo: 'Corregir la nota',
        usuario: 'tester',
      }),
    ).rejects.toThrow(/sobre otra nota/);

    const otra = await facturaEmitida(500);
    await anularDocumentoFiscal(prisma, { id: otra.id, usuario: 'tester', motivo: 'Prueba' });
    await expect(
      emitirNotaFiscal(prisma, {
        documentoOrigenId: otra.id,
        tipo: 'nota_credito',
        monto: 50,
        motivo: 'Ajuste sobre anulada',
        usuario: 'tester',
      }),
    ).rejects.toThrow(/anulado/);
  });

  // Anular la factura dejaría sus notas apuntando a algo que ya no declara nada, y las
  // notas siguen contando en el libro.
  it('no anula un documento con notas emitidas, y sí después de anularlas', async () => {
    const factura = await facturaEmitida(800);
    await crearCaiActivo('nota_credito');

    const nota = await emitirNotaFiscal(prisma, {
      documentoOrigenId: factura.id,
      tipo: 'nota_credito',
      monto: 200,
      motivo: 'Ajuste del día',
      usuario: 'tester',
    });

    await expect(
      anularDocumentoFiscal(prisma, { id: factura.id, usuario: 'tester', motivo: 'Cliente equivocado' }),
    ).rejects.toThrow(/nota/);

    await anularDocumentoFiscal(prisma, { id: nota.id, usuario: 'tester', motivo: 'Se emitió por error' });
    const anulada = await anularDocumentoFiscal(prisma, {
      id: factura.id,
      usuario: 'tester',
      motivo: 'Cliente equivocado',
    });

    expect(anulada?.estado).toBe('anulado');
  });

  // Los CHECK de la migración, comprobados sin pasar por la aplicación.
  it('la base rechaza una nota sin motivo o que también ampare una transacción', async () => {
    const factura = await facturaEmitida(400);
    const cai = await crearCaiActivo('nota_credito');
    const base = {
      caiId: cai.id,
      tipoDocumento: 'nota_credito',
      businessDate: HOY,
      emitidoPor: 'tester',
      total: 100,
      snapshot: {},
      formatoVersion: '1',
    };

    // Sin motivo: la nota no se podría explicar en una revisión.
    await expect(
      prisma.fiscalDocument.create({
        data: {
          ...base,
          correlativo: cai.rangoHasta - 1,
          numeroCompleto: `${ESTABLECIMIENTO}-${PUNTO_EMISION}-03-sin-motivo-${SUFIJO}`,
          documentoOrigenId: factura.id,
        },
      }),
    ).rejects.toThrow();

    // Con las dos referencias: sería a la vez el documento de una venta y la corrección
    // de otro documento.
    const venta = await crearVenta(100);
    await expect(
      prisma.fiscalDocument.create({
        data: {
          ...base,
          correlativo: cai.rangoHasta - 2,
          numeroCompleto: `${ESTABLECIMIENTO}-${PUNTO_EMISION}-03-dos-refs-${SUFIJO}`,
          documentoOrigenId: factura.id,
          notaMotivo: 'Motivo válido',
          saleTransactionId: venta.id,
        },
      }),
    ).rejects.toThrow();
  });
});
