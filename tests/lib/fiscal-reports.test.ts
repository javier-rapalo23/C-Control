import type { PrismaClient } from '@prisma/client';
import { getFiscalBookReport, getFiscalPendingReport } from '@/lib/fiscal-reports';

/**
 * Los reportes fiscales se prueban contra un doble de Prisma: lo que hay que fijar no
 * es la consulta sino las tres reglas del libro —qué fecha lo ordena, que los anulados
 * aparezcan sin sumar, y que los datos salgan del snapshot y no de los registros
 * vivos—, más la detección de huecos en la numeración.
 */

type DocFake = {
  id: string;
  tipoDocumento?: string;
  correlativo: number;
  numeroCompleto?: string;
  estado?: string;
  businessDate?: string;
  /** Instante de emisión, en UTC: es lo que se guarda en la base. */
  emitidoEn: string;
  caiId?: string;
  total?: number;
  importeExento?: number;
  importeGravado15?: number;
  isv15?: number;
  anulacionMotivo?: string | null;
  snapshot?: unknown;
};

function documento(doc: DocFake) {
  const total = doc.total ?? 1000;
  return {
    id: doc.id,
    tipoDocumento: doc.tipoDocumento ?? 'boleta_compra',
    correlativo: doc.correlativo,
    numeroCompleto: doc.numeroCompleto ?? `001-001-04-${String(doc.correlativo).padStart(8, '0')}`,
    estado: doc.estado ?? 'emitido',
    businessDate: new Date(`${doc.businessDate ?? '2026-09-20'}T00:00:00.000Z`),
    emitidoEn: new Date(doc.emitidoEn),
    emitidoPor: 'usr-1',
    caiId: doc.caiId ?? 'cai-1',
    purchaseTransactionId: 'pt-1',
    saleTransactionId: null,
    grindingServiceId: null,
    total,
    importeExento: doc.importeExento ?? total,
    importeExonerado: 0,
    importeGravado15: doc.importeGravado15 ?? 0,
    importeGravado18: 0,
    isv15: doc.isv15 ?? 0,
    isv18: 0,
    anulacionMotivo: doc.anulacionMotivo ?? null,
    snapshot: doc.snapshot ?? {
      numeroInterno: 'C-000123',
      sucursalNombre: 'Bodega San Juan',
      cliente: { nombre: 'Juan Pérez', rtn: '0801-1990-123456' },
    },
    cai: { codigo: 'CAI-ABC' },
  };
}

/**
 * Doble de `fiscalDocument.findMany`. Aplica los dos filtros que sí manda la consulta
 * —tipo de documento y ventana de instantes— para que el recorte por fecha de negocio,
 * que ocurre en JavaScript, se pruebe de verdad y no sobre una lista ya filtrada.
 */
function fakeDb(docs: DocFake[]) {
  const filas = docs.map(documento);

  return {
    fiscalDocument: {
      findMany: async ({
        where,
      }: {
        where: { tipoDocumento: { in: string[] }; emitidoEn: { gte: Date; lt: Date } };
      }) =>
        filas
          .filter((fila) => where.tipoDocumento.in.includes(fila.tipoDocumento))
          .filter((fila) => fila.emitidoEn >= where.emitidoEn.gte && fila.emitidoEn < where.emitidoEn.lt)
          .sort((a, b) => a.emitidoEn.getTime() - b.emitidoEn.getTime() || a.correlativo - b.correlativo),
    },
  } as unknown as PrismaClient;
}

const SEPTIEMBRE = { libro: 'compras' as const, from: '2026-09-01', to: '2026-09-30' };

describe('getFiscalBookReport', () => {
  it('ordena por fecha de emisión y trae los datos del snapshot', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        { id: 'fd-2', correlativo: 2, emitidoEn: '2026-09-15T16:00:00.000Z' },
        { id: 'fd-1', correlativo: 1, emitidoEn: '2026-09-10T16:00:00.000Z' },
      ]),
      SEPTIEMBRE,
    );

    expect(reporte.rows.map((row) => row.id)).toEqual(['fd-1', 'fd-2']);
    expect(reporte.rows[0]).toMatchObject({
      fechaEmision: '2026-09-10',
      businessDate: '2026-09-20',
      numeroInterno: 'C-000123',
      clienteNombre: 'Juan Pérez',
      clienteRtn: '0801-1990-123456',
      sucursalNombre: 'Bodega San Juan',
      origen: 'compra',
      caiCodigo: 'CAI-ABC',
    });
  });

  // El rango llega en fechas de negocio y `emitidoEn` es un instante: un documento
  // emitido a las 22:00 de Honduras se guarda con fecha UTC del día siguiente, y aun
  // así pertenece al día hondureño en que se emitió.
  it('recorta por fecha de negocio, no por la fecha UTC del instante', async () => {
    const docs: DocFake[] = [{ id: 'fd-1', correlativo: 1, emitidoEn: '2026-10-01T04:00:00.000Z' }];

    const septiembre = await getFiscalBookReport(fakeDb(docs), SEPTIEMBRE);
    expect(septiembre.rows.map((row) => row.fechaEmision)).toEqual(['2026-09-30']);

    const octubre = await getFiscalBookReport(fakeDb(docs), {
      libro: 'compras',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(octubre.rows).toHaveLength(0);
  });

  it('el anulado aparece en el libro pero no suma en los totales', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        { id: 'fd-1', correlativo: 1, emitidoEn: '2026-09-10T16:00:00.000Z', total: 1000 },
        {
          id: 'fd-2',
          correlativo: 2,
          emitidoEn: '2026-09-11T16:00:00.000Z',
          total: 500,
          estado: 'anulado',
          anulacionMotivo: 'Cliente equivocado',
        },
      ]),
      SEPTIEMBRE,
    );

    expect(reporte.rows).toHaveLength(2);
    expect(reporte.rows[1]).toMatchObject({ anulado: true, anulacionMotivo: 'Cliente equivocado' });
    expect(reporte.totals).toMatchObject({
      documentos: 2,
      anulados: 1,
      importeExento: 1000,
      total: 1000,
      totalAnulado: 500,
    });
  });

  it('suma el desglose gravado aparte del exento', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        {
          id: 'fd-1',
          correlativo: 1,
          emitidoEn: '2026-09-10T16:00:00.000Z',
          tipoDocumento: 'factura',
          total: 100,
          importeExento: 0,
          importeGravado15: 86.96,
          isv15: 13.04,
        },
      ]),
      { libro: 'ventas', from: '2026-09-01', to: '2026-09-30' },
    );

    expect(reporte.totals).toMatchObject({ importeGravado15: 86.96, isv15: 13.04, total: 100, importeExento: 0 });
  });

  // Cada libro es de su tipo de documento: una boleta de compra no puede aparecer en
  // el libro de ventas ni al revés.
  it('cada libro trae solo su tipo de documento', async () => {
    const docs: DocFake[] = [
      { id: 'fd-1', correlativo: 1, emitidoEn: '2026-09-10T16:00:00.000Z', tipoDocumento: 'boleta_compra' },
      { id: 'fd-2', correlativo: 1, emitidoEn: '2026-09-11T16:00:00.000Z', tipoDocumento: 'factura' },
    ];

    const compras = await getFiscalBookReport(fakeDb(docs), SEPTIEMBRE);
    expect(compras.rows.map((row) => row.id)).toEqual(['fd-1']);

    const ventas = await getFiscalBookReport(fakeDb(docs), { ...SEPTIEMBRE, libro: 'ventas' });
    expect(ventas.rows.map((row) => row.id)).toEqual(['fd-2']);
  });

  it('informa los números que faltan entre el primero y el último del período', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        { id: 'fd-1', correlativo: 10, emitidoEn: '2026-09-10T16:00:00.000Z' },
        { id: 'fd-2', correlativo: 13, emitidoEn: '2026-09-11T16:00:00.000Z' },
        { id: 'fd-3', correlativo: 14, emitidoEn: '2026-09-12T16:00:00.000Z' },
      ]),
      SEPTIEMBRE,
    );

    expect(reporte.saltos).toEqual([
      { caiCodigo: 'CAI-ABC', tipoDocumentoLabel: 'Boleta de compra', desde: 11, hasta: 12, cantidad: 2 },
    ]);
  });

  it('una numeración corrida no reporta saltos', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        { id: 'fd-1', correlativo: 7, emitidoEn: '2026-09-10T16:00:00.000Z' },
        { id: 'fd-2', correlativo: 8, emitidoEn: '2026-09-11T16:00:00.000Z' },
      ]),
      SEPTIEMBRE,
    );

    expect(reporte.saltos).toEqual([]);
  });

  // Los correlativos de dos CAI distintos son series separadas: compararlos entre sí
  // inventaría huecos que no existen.
  it('no cruza la numeración de dos CAI', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([
        { id: 'fd-1', correlativo: 1, emitidoEn: '2026-09-10T16:00:00.000Z', caiId: 'cai-1' },
        { id: 'fd-2', correlativo: 500, emitidoEn: '2026-09-11T16:00:00.000Z', caiId: 'cai-2' },
      ]),
      SEPTIEMBRE,
    );

    expect(reporte.saltos).toEqual([]);
  });

  // Un snapshot de una versión vieja puede no traer un campo: el libro completo no
  // puede caerse por eso.
  it('tolera un snapshot con otra forma', async () => {
    const reporte = await getFiscalBookReport(
      fakeDb([{ id: 'fd-1', correlativo: 1, emitidoEn: '2026-09-10T16:00:00.000Z', snapshot: { cliente: null } }]),
      SEPTIEMBRE,
    );

    expect(reporte.rows[0]).toMatchObject({ clienteNombre: null, clienteRtn: null, numeroInterno: null });
  });

  it('rechaza un rango invertido', async () => {
    await expect(
      getFiscalBookReport(fakeDb([]), { libro: 'compras', from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toThrow(/invertido/);
  });
});

/** Doble para los pendientes: tres consultas, una por origen. */
function fakePendingDb(data: {
  compras?: Array<{ id: string; businessDate: string; total: number; numeroInterno: number; cliente?: string }>;
  ventas?: Array<{ id: string; businessDate: string; total: number; numeroInterno: number }>;
  molidos?: Array<{ id: string; businessDate: string; monto: number }>;
}) {
  const base = (businessDate: string, cliente = 'Juan Pérez') => ({
    businessDate: new Date(`${businessDate}T00:00:00.000Z`),
    client: { nombre: cliente },
    sucursal: { nombre: 'Bodega San Juan' },
  });

  return {
    purchaseTransaction: {
      findMany: async () =>
        (data.compras ?? []).map((compra) => ({
          id: compra.id,
          ...base(compra.businessDate, compra.cliente),
          total: compra.total,
          numeroInterno: compra.numeroInterno,
        })),
    },
    saleTransaction: {
      findMany: async () =>
        (data.ventas ?? []).map((venta) => ({
          id: venta.id,
          ...base(venta.businessDate),
          total: venta.total,
          numeroInterno: venta.numeroInterno,
        })),
    },
    grindingService: {
      findMany: async () =>
        (data.molidos ?? []).map((molido) => ({
          id: molido.id,
          ...base(molido.businessDate),
          monto: molido.monto,
        })),
    },
  } as unknown as PrismaClient;
}

describe('getFiscalPendingReport', () => {
  // `diasSinEmitir` se cuenta contra hoy, así que la fecha del sistema se fija.
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-28T15:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const RANGO = { from: '2026-09-01', to: '2026-09-30' };

  it('junta los tres orígenes, ordenados por fecha, y totaliza por origen', async () => {
    const reporte = await getFiscalPendingReport(
      fakePendingDb({
        compras: [{ id: 'pt-1', businessDate: '2026-09-25', total: 1000, numeroInterno: 123 }],
        ventas: [{ id: 'st-1', businessDate: '2026-09-20', total: 2000, numeroInterno: 45 }],
        molidos: [{ id: 'gs-1', businessDate: '2026-09-27', monto: 150 }],
      }),
      RANGO,
    );

    expect(reporte.rows.map((row) => [row.businessDate, row.origen])).toEqual([
      ['2026-09-20', 'venta'],
      ['2026-09-25', 'compra'],
      ['2026-09-27', 'molido'],
    ]);
    expect(reporte.totals.documentos).toBe(3);
    expect(reporte.totals.total).toBe(3150);
    expect(reporte.totals.porOrigen).toEqual([
      { origen: 'compra', origenLabel: 'Compra', documentos: 1, total: 1000 },
      { origen: 'venta', origenLabel: 'Venta', documentos: 1, total: 2000 },
      { origen: 'molido', origenLabel: 'Molido', documentos: 1, total: 150 },
    ]);
  });

  // La serie del correlativo interno distingue compra de venta, y el molido no tiene.
  it('formatea el correlativo interno de cada serie', async () => {
    const reporte = await getFiscalPendingReport(
      fakePendingDb({
        compras: [{ id: 'pt-1', businessDate: '2026-09-25', total: 1000, numeroInterno: 123 }],
        ventas: [{ id: 'st-1', businessDate: '2026-09-25', total: 2000, numeroInterno: 45 }],
        molidos: [{ id: 'gs-1', businessDate: '2026-09-25', monto: 150 }],
      }),
      RANGO,
    );

    expect(reporte.rows.map((row) => row.numeroInterno)).toEqual(['C-000123', 'V-000045', null]);
  });

  it('cuenta los días que lleva sin documento', async () => {
    const reporte = await getFiscalPendingReport(
      fakePendingDb({
        compras: [
          { id: 'pt-1', businessDate: '2026-09-28', total: 10, numeroInterno: 1 },
          { id: 'pt-2', businessDate: '2026-09-18', total: 10, numeroInterno: 2 },
        ],
      }),
      RANGO,
    );

    expect(reporte.rows.map((row) => row.diasSinEmitir)).toEqual([10, 0]);
  });

  it('sin pendientes devuelve el período en cero', async () => {
    const reporte = await getFiscalPendingReport(fakePendingDb({}), RANGO);

    expect(reporte.rows).toEqual([]);
    expect(reporte.totals).toMatchObject({ documentos: 0, total: 0, porOrigen: [] });
  });
});
