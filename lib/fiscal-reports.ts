import { Prisma, PrismaClient } from '@prisma/client';
import { businessDateOf, parseBusinessDate, todayBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { esNota, signoLibro, tipoDocumentoLabel } from '@/lib/fiscal';
import { formatNumeroInterno } from '@/lib/build-invoice';
import type { CsvColumn } from '@/lib/csv';
import type {
  FiscalBookGapDTO,
  FiscalBookReportDTO,
  FiscalBookRowDTO,
  FiscalPendingReportDTO,
  FiscalPendingRowDTO,
} from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Reportes fiscales: libro de compras, libro de ventas y pendientes de emitir.
 *
 * Tres decisiones gobiernan este archivo:
 *
 * 1. **El libro se ordena por fecha de emisión**, no por la fecha de la compra o la
 *    venta. Es la fecha que el documento declara y la que sigue el correlativo; la
 *    fecha de negocio de la transacción va en su propia columna porque el papel a
 *    veces se hace días después del pesaje.
 * 2. **Los anulados aparecen y no suman.** Un número anulado no se libera nunca, así
 *    que tiene que estar en el libro para que la numeración se lea completa, pero su
 *    monto no es ingreso ni gasto. Los totales lo dejan fuera y lo informan aparte.
 * 3. **Los datos del cliente salen del `snapshot`.** Es la copia inmutable de lo
 *    impreso. Leerlos de `Client` daría un libro que cambia cuando alguien corrige un
 *    RTN, y el papel ya entregado dejaría de coincidir con el libro.
 */

export type FiscalBookKind = 'compras' | 'ventas';

/**
 * Qué tipos de documento entran en cada libro.
 *
 * Las notas **no se listan acá**: una nota de crédito puede corregir una boleta de
 * compra o una factura, así que el libro al que pertenece lo decide el documento que
 * modifica, no su propio tipo. Se traen por su `documentoOrigen` (ver la consulta).
 */
const TIPOS_POR_LIBRO: Record<FiscalBookKind, string[]> = {
  compras: ['boleta_compra'],
  ventas: ['factura'],
};

export function isFiscalBookKind(value: string | null): value is FiscalBookKind {
  return value === 'compras' || value === 'ventas';
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

const MS_POR_DIA = 86_400_000;

type SnapshotLeido = {
  numeroInterno: string | null;
  clienteNombre: string | null;
  clienteRtn: string | null;
  sucursalNombre: string | null;
};

/**
 * Lectura defensiva del snapshot. Es `Json` en la base y su forma depende de
 * `formatoVersion`: un documento emitido con una versión vieja puede no traer un
 * campo. Antes que romper el libro completo, la celda sale vacía.
 */
function leerSnapshot(snapshot: Prisma.JsonValue | null): SnapshotLeido {
  const vacio: SnapshotLeido = {
    numeroInterno: null,
    clienteNombre: null,
    clienteRtn: null,
    sucursalNombre: null,
  };
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return vacio;

  const data = snapshot as Record<string, unknown>;
  const cliente =
    typeof data.cliente === 'object' && data.cliente !== null ? (data.cliente as Record<string, unknown>) : {};

  const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() !== '' ? valor : null);

  return {
    numeroInterno: texto(data.numeroInterno),
    clienteNombre: texto(cliente.nombre),
    clienteRtn: texto(cliente.rtn),
    sucursalNombre: texto(data.sucursalNombre),
  };
}

type DocumentoParaLibro = {
  id: string;
  tipoDocumento: string;
  correlativo: number;
  numeroCompleto: string;
  estado: string;
  businessDate: Date;
  emitidoEn: Date;
  emitidoPor: string;
  caiId: string;
  purchaseTransactionId: string | null;
  saleTransactionId: string | null;
  grindingServiceId: string | null;
  total: Prisma.Decimal;
  importeExento: Prisma.Decimal;
  importeExonerado: Prisma.Decimal;
  importeGravado15: Prisma.Decimal;
  importeGravado18: Prisma.Decimal;
  isv15: Prisma.Decimal;
  isv18: Prisma.Decimal;
  anulacionMotivo: string | null;
  notaMotivo: string | null;
  snapshot: Prisma.JsonValue;
  cai?: { codigo: string } | null;
  documentoOrigen?: { numeroCompleto: string; tipoDocumento: string } | null;
};

function origenDe(doc: DocumentoParaLibro): 'compra' | 'venta' | 'molido' | null {
  if (doc.purchaseTransactionId) return 'compra';
  if (doc.saleTransactionId) return 'venta';
  if (doc.grindingServiceId) return 'molido';
  return null;
}

/**
 * Un renglón del libro, **con el signo ya aplicado**.
 *
 * Los montos de una nota de crédito salen negativos: es como entra al libro y como debe
 * sumarse en Excel. En el documento impreso van en positivo —"nota de crédito por
 * L 500.00"—, que es otra cosa y sale del snapshot, no de acá.
 */
function mapFilaLibro(doc: DocumentoParaLibro): FiscalBookRowDTO {
  const snapshot = leerSnapshot(doc.snapshot);
  const signo = signoLibro(doc.tipoDocumento);
  const firmado = (valor: Prisma.Decimal) => redondear(signo * Number(valor));

  return {
    id: doc.id,
    numeroCompleto: doc.numeroCompleto,
    correlativo: doc.correlativo,
    tipoDocumento: doc.tipoDocumento,
    tipoDocumentoLabel: tipoDocumentoLabel(doc.tipoDocumento),
    caiCodigo: doc.cai?.codigo ?? null,
    fechaEmision: businessDateOf(doc.emitidoEn),
    businessDate: toBusinessDateString(doc.businessDate),
    numeroInterno: snapshot.numeroInterno,
    clienteNombre: snapshot.clienteNombre,
    clienteRtn: snapshot.clienteRtn,
    sucursalNombre: snapshot.sucursalNombre,
    origen: origenDe(doc),
    importeExento: firmado(doc.importeExento),
    importeExonerado: firmado(doc.importeExonerado),
    importeGravado15: firmado(doc.importeGravado15),
    importeGravado18: firmado(doc.importeGravado18),
    isv15: firmado(doc.isv15),
    isv18: firmado(doc.isv18),
    total: firmado(doc.total),
    estado: doc.estado,
    anulado: doc.estado === 'anulado',
    anulacionMotivo: doc.anulacionMotivo,
    emitidoPor: doc.emitidoPor,
    esNota: esNota(doc.tipoDocumento),
    signo,
    notaMotivo: doc.notaMotivo,
    documentoOrigenNumero: doc.documentoOrigen?.numeroCompleto ?? null,
  };
}

/**
 * Huecos de numeración dentro del período, por CAI.
 *
 * Solo se miran los números **entre el primero y el último** del período: lo que
 * falte antes o después se emitió otro día y no es un hueco. Con el contador
 * bloqueado no deberían aparecer, pero en modo talonario el número lo teclea una
 * persona y saltarse una hoja es posible.
 */
function detectarSaltos(rows: FiscalBookRowDTO[], docs: DocumentoParaLibro[]): FiscalBookGapDTO[] {
  const porCai = new Map<string, { caiCodigo: string | null; tipoDocumentoLabel: string; correlativos: number[] }>();

  docs.forEach((doc, indice) => {
    const fila = rows[indice];
    const grupo = porCai.get(doc.caiId) ?? {
      caiCodigo: fila.caiCodigo,
      tipoDocumentoLabel: fila.tipoDocumentoLabel,
      correlativos: [],
    };
    grupo.correlativos.push(doc.correlativo);
    porCai.set(doc.caiId, grupo);
  });

  const saltos: FiscalBookGapDTO[] = [];

  for (const grupo of porCai.values()) {
    const ordenados = [...new Set(grupo.correlativos)].sort((a, b) => a - b);

    for (let i = 1; i < ordenados.length; i += 1) {
      const anterior = ordenados[i - 1];
      const actual = ordenados[i];
      if (actual - anterior <= 1) continue;

      saltos.push({
        caiCodigo: grupo.caiCodigo,
        tipoDocumentoLabel: grupo.tipoDocumentoLabel,
        desde: anterior + 1,
        hasta: actual - 1,
        cantidad: actual - anterior - 1,
      });
    }
  }

  return saltos;
}

export async function getFiscalBookReport(
  db: DbClient,
  input: { libro: FiscalBookKind; from: string; to: string },
): Promise<FiscalBookReportDTO> {
  const { libro, from, to } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  // `emitidoEn` es un instante y el rango viene en fechas de negocio. Se consulta con
  // un día de margen a cada lado y el recorte fino se hace con `businessDateOf`: así
  // no hay que repetir acá el desfase de Honduras, que es justo lo que haría que un
  // documento emitido a las siete de la noche apareciera en el día siguiente.
  const margenDesde = new Date(parseBusinessDate(from).getTime() - MS_POR_DIA);
  const margenHasta = new Date(parseBusinessDate(to).getTime() + 2 * MS_POR_DIA);

  const documentos = (await db.fiscalDocument.findMany({
    where: {
      emitidoEn: { gte: margenDesde, lt: margenHasta },
      // El documento propio del libro, **o** una nota que corrige uno de ellos: una nota
      // de crédito sobre una boleta de compra pertenece al libro de compras, no al de
      // ventas, aunque su propio tipo sea el mismo en los dos casos.
      OR: [
        { tipoDocumento: { in: TIPOS_POR_LIBRO[libro] } },
        { documentoOrigen: { tipoDocumento: { in: TIPOS_POR_LIBRO[libro] } } },
      ],
    },
    orderBy: [{ emitidoEn: 'asc' }, { correlativo: 'asc' }],
    include: {
      cai: { select: { codigo: true } },
      documentoOrigen: { select: { numeroCompleto: true, tipoDocumento: true } },
    },
  })) as DocumentoParaLibro[];

  const dentroDelRango = documentos.filter((doc) => {
    const fecha = businessDateOf(doc.emitidoEn);
    return fecha >= from && fecha <= to;
  });

  const rows = dentroDelRango.map(mapFilaLibro);

  const totals = {
    documentos: rows.length,
    anulados: 0,
    importeExento: 0,
    importeExonerado: 0,
    importeGravado15: 0,
    importeGravado18: 0,
    isv15: 0,
    isv18: 0,
    total: 0,
    totalAnulado: 0,
  };

  for (const row of rows) {
    if (row.anulado) {
      totals.anulados += 1;
      totals.totalAnulado = redondear(totals.totalAnulado + row.total);
      continue;
    }
    totals.importeExento = redondear(totals.importeExento + row.importeExento);
    totals.importeExonerado = redondear(totals.importeExonerado + row.importeExonerado);
    totals.importeGravado15 = redondear(totals.importeGravado15 + row.importeGravado15);
    totals.importeGravado18 = redondear(totals.importeGravado18 + row.importeGravado18);
    totals.isv15 = redondear(totals.isv15 + row.isv15);
    totals.isv18 = redondear(totals.isv18 + row.isv18);
    totals.total = redondear(totals.total + row.total);
  }

  return { libro, from, to, rows, totals, saltos: detectarSaltos(rows, dentroDelRango) };
}

const ORIGEN_LABEL: Record<'compra' | 'venta' | 'molido', string> = {
  compra: 'Compra',
  venta: 'Venta',
  molido: 'Molido',
};

const ORDEN_ORIGEN: Record<'compra' | 'venta' | 'molido', number> = { compra: 0, venta: 1, molido: 2 };

/**
 * Transacciones del período que todavía no tienen documento fiscal.
 *
 * Es el reporte que dice qué queda por facturar. Se ordena por antigüedad y no por
 * monto: lo que lleva más días sin documento es lo que arriesga cerrar el mes con un
 * movimiento sin respaldo.
 */
export async function getFiscalPendingReport(
  db: DbClient,
  input: { from: string; to: string; sucursalId?: string | null },
): Promise<FiscalPendingReportDTO> {
  const { from, to } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  const where = {
    businessDate: { gte: parseBusinessDate(from), lte: parseBusinessDate(to) },
    // `is: null` es cómo se pregunta por la ausencia de la relación uno a uno.
    fiscalDocument: { is: null },
    ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
  };
  const select = {
    id: true,
    businessDate: true,
    client: { select: { nombre: true } },
    sucursal: { select: { nombre: true } },
  } as const;

  const [compras, ventas, molidos] = await Promise.all([
    db.purchaseTransaction.findMany({ where, select: { ...select, total: true, numeroInterno: true } }),
    db.saleTransaction.findMany({ where, select: { ...select, total: true, numeroInterno: true } }),
    // El molido no tiene correlativo interno propio y su monto se llama `monto`.
    db.grindingService.findMany({ where, select: { ...select, monto: true } }),
  ]);

  const hoy = parseBusinessDate(todayBusinessDate());
  const diasSinEmitir = (businessDate: Date) =>
    Math.max(0, Math.round((hoy.getTime() - businessDate.getTime()) / MS_POR_DIA));

  const rows: FiscalPendingRowDTO[] = [
    ...compras.map((compra) => ({
      origen: 'compra' as const,
      origenLabel: ORIGEN_LABEL.compra,
      transactionId: compra.id,
      businessDate: toBusinessDateString(compra.businessDate),
      numeroInterno: formatNumeroInterno('compra', compra.numeroInterno),
      clienteNombre: compra.client.nombre,
      sucursalNombre: compra.sucursal.nombre,
      total: Number(compra.total),
      diasSinEmitir: diasSinEmitir(compra.businessDate),
    })),
    ...ventas.map((venta) => ({
      origen: 'venta' as const,
      origenLabel: ORIGEN_LABEL.venta,
      transactionId: venta.id,
      businessDate: toBusinessDateString(venta.businessDate),
      numeroInterno: formatNumeroInterno('venta', venta.numeroInterno),
      clienteNombre: venta.client.nombre,
      sucursalNombre: venta.sucursal.nombre,
      total: Number(venta.total),
      diasSinEmitir: diasSinEmitir(venta.businessDate),
    })),
    ...molidos.map((molido) => ({
      origen: 'molido' as const,
      origenLabel: ORIGEN_LABEL.molido,
      transactionId: molido.id,
      businessDate: toBusinessDateString(molido.businessDate),
      numeroInterno: null,
      clienteNombre: molido.client.nombre,
      sucursalNombre: molido.sucursal.nombre,
      total: Number(molido.monto),
      diasSinEmitir: diasSinEmitir(molido.businessDate),
    })),
    // Dentro del mismo día se ordena por origen en el orden del catálogo (compra,
    // venta, molido) y no alfabético, para que la tabla coincida con los subtotales.
  ].sort((a, b) =>
    a.businessDate === b.businessDate
      ? ORDEN_ORIGEN[a.origen] - ORDEN_ORIGEN[b.origen]
      : a.businessDate.localeCompare(b.businessDate),
  );

  const porOrigenMap = new Map<'compra' | 'venta' | 'molido', { documentos: number; total: number }>();
  let total = 0;

  for (const row of rows) {
    const acumulado = porOrigenMap.get(row.origen) ?? { documentos: 0, total: 0 };
    acumulado.documentos += 1;
    acumulado.total = redondear(acumulado.total + row.total);
    porOrigenMap.set(row.origen, acumulado);
    total = redondear(total + row.total);
  }

  return {
    from,
    to,
    sucursalId: input.sucursalId ?? null,
    rows,
    totals: {
      documentos: rows.length,
      total,
      // El orden es el del catálogo y no el de aparición, para que la tabla no cambie
      // de orden entre dos consultas del mismo período.
      porOrigen: (['compra', 'venta', 'molido'] as const)
        .filter((origen) => porOrigenMap.has(origen))
        .map((origen) => ({
          origen,
          origenLabel: ORIGEN_LABEL[origen],
          documentos: porOrigenMap.get(origen)!.documentos,
          total: porOrigenMap.get(origen)!.total,
        })),
    },
  };
}

/**
 * Columnas del libro para exportar. Los montos van como número —sin `L` ni separador
 * de miles— para que se puedan sumar en Excel sin limpiar la columna antes, y con el
 * signo del libro: una nota de crédito exporta importes negativos.
 *
 * Un documento anulado se exporta con su monto en la columna aparte `Anulado`: si
 * fuera en la misma columna que los demás, arrastrar la suma en Excel daría un total
 * distinto al del reporte.
 */
export const fiscalBookCsvColumns: CsvColumn<FiscalBookRowDTO>[] = [
  { header: 'Fecha emisión', value: (row) => row.fechaEmision },
  { header: 'Número', value: (row) => row.numeroCompleto },
  { header: 'Tipo', value: (row) => row.tipoDocumentoLabel },
  { header: 'CAI', value: (row) => row.caiCodigo },
  { header: 'Estado', value: (row) => (row.anulado ? 'Anulado' : 'Emitido') },
  // Qué documento corrige la nota: sin esto, un renglón negativo no se puede explicar.
  { header: 'Modifica', value: (row) => row.documentoOrigenNumero },
  { header: 'Motivo de la nota', value: (row) => row.notaMotivo },
  { header: 'Fecha operación', value: (row) => row.businessDate },
  { header: 'Control interno', value: (row) => row.numeroInterno },
  { header: 'Cliente', value: (row) => row.clienteNombre },
  { header: 'RTN', value: (row) => row.clienteRtn },
  { header: 'Sucursal', value: (row) => row.sucursalNombre },
  { header: 'Exento', value: (row) => (row.anulado ? 0 : row.importeExento) },
  { header: 'Exonerado', value: (row) => (row.anulado ? 0 : row.importeExonerado) },
  { header: 'Gravado 15%', value: (row) => (row.anulado ? 0 : row.importeGravado15) },
  { header: 'ISV 15%', value: (row) => (row.anulado ? 0 : row.isv15) },
  { header: 'Gravado 18%', value: (row) => (row.anulado ? 0 : row.importeGravado18) },
  { header: 'ISV 18%', value: (row) => (row.anulado ? 0 : row.isv18) },
  { header: 'Total', value: (row) => (row.anulado ? 0 : row.total) },
  { header: 'Anulado', value: (row) => (row.anulado ? row.total : 0) },
  { header: 'Motivo anulación', value: (row) => row.anulacionMotivo },
  { header: 'Emitido por', value: (row) => row.emitidoPor },
];

export const fiscalPendingCsvColumns: CsvColumn<FiscalPendingRowDTO>[] = [
  { header: 'Fecha', value: (row) => row.businessDate },
  { header: 'Origen', value: (row) => row.origenLabel },
  { header: 'Control interno', value: (row) => row.numeroInterno },
  { header: 'Cliente', value: (row) => row.clienteNombre },
  { header: 'Sucursal', value: (row) => row.sucursalNombre },
  { header: 'Total', value: (row) => row.total },
  { header: 'Días sin emitir', value: (row) => row.diasSinEmitir },
];
