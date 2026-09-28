import { Prisma, PrismaClient } from '@prisma/client';
import { businessDateOf, parseBusinessDate, todayBusinessDate, toBusinessDateString } from '@/lib/business-date';
import {
  CLASIFICACION_FISCAL_MOLIDO,
  type DesgloseIsv,
  type LineaFiscal,
  type OrigenDocumento,
  TIPO_DOCUMENTO_POR_ORIGEN,
  desgloseIsv,
  desgloseNota,
  esNota,
  evaluarCai,
  formatNumeroFiscal,
  motivoNoEmitible,
  puedeAnularse,
  signoLibro,
  tipoDocumentoLabel,
  type TipoNota,
} from '@/lib/fiscal';
import { buildInvoiceForGrinding, buildInvoiceForPurchase, buildInvoiceForSale } from '@/lib/build-invoice';
import type { FiscalDocumentDTO, FiscalNotaResumenDTO } from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Emisión y anulación de documentos fiscales.
 *
 * Dos reglas gobiernan todo lo de acá y conviene leerlas antes de tocar nada:
 *
 * 1. **El correlativo no puede saltarse ni repetirse.** Se asigna desde el contador
 *    de la fila del CAI, bloqueada con `SELECT ... FOR UPDATE` dentro de la misma
 *    transacción que crea el documento. Si algo falla, el rollback devuelve el
 *    contador y el número no se consume. Una secuencia de Postgres no serviría: el
 *    rollback se la come y deja hueco.
 * 2. **Lo emitido es inmutable.** El documento guarda un `snapshot` de lo impreso,
 *    así que reimprimir no depende de los datos vivos, y la transacción que ampara
 *    queda bloqueada para edición y borrado.
 */

/** Versión de la maquetación con la que se arma el snapshot. */
export const FORMATO_VERSION = '1';

/** Se lanza al intentar borrar o editar una transacción que ya tiene documento. */
export class DocumentoEmitidoError extends Error {
  readonly numeroCompleto: string;

  constructor(numeroCompleto: string) {
    super(
      `Esta transacción tiene el documento fiscal ${numeroCompleto} emitido: no se puede modificar ni eliminar. ` +
        'Anúlelo si fue un error.',
    );
    this.name = 'DocumentoEmitidoError';
    this.numeroCompleto = numeroCompleto;
  }
}

/** El CAI no está en condiciones de emitir: inactivo, vencido, agotado o ausente. */
export class CaiNoDisponibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaiNoDisponibleError';
  }
}

type FiscalDocumentRow = {
  id: string;
  caiId: string;
  tipoDocumento: string;
  correlativo: number;
  numeroCompleto: string;
  estado: string;
  businessDate: Date;
  emitidoEn: Date;
  emitidoPor: string;
  purchaseTransactionId: string | null;
  saleTransactionId: string | null;
  grindingServiceId: string | null;
  total: Prisma.Decimal;
  moneda: string;
  importeExento: Prisma.Decimal;
  importeExonerado: Prisma.Decimal;
  importeGravado15: Prisma.Decimal;
  importeGravado18: Prisma.Decimal;
  isv15: Prisma.Decimal;
  isv18: Prisma.Decimal;
  formatoVersion: string;
  anuladoEn: Date | null;
  anuladoPor: string | null;
  anulacionMotivo: string | null;
  copiaFisicaResguardada: boolean;
  copiaFisicaUbicacion: string | null;
  documentoOrigenId: string | null;
  notaMotivo: string | null;
  cai?: { codigo: string } | null;
  documentoOrigen?: { id: string; numeroCompleto: string; tipoDocumento: string; emitidoEn: Date } | null;
  notas?: NotaRow[];
};

type NotaRow = {
  id: string;
  tipoDocumento: string;
  numeroCompleto: string;
  estado: string;
  total: Prisma.Decimal;
  notaMotivo: string | null;
  emitidoEn: Date;
};

export function mapFiscalDocument(doc: FiscalDocumentRow): FiscalDocumentDTO {
  return {
    id: doc.id,
    caiId: doc.caiId,
    caiCodigo: doc.cai?.codigo ?? null,
    tipoDocumento: doc.tipoDocumento,
    tipoDocumentoLabel: tipoDocumentoLabel(doc.tipoDocumento),
    correlativo: doc.correlativo,
    numeroCompleto: doc.numeroCompleto,
    estado: doc.estado,
    businessDate: toBusinessDateString(doc.businessDate),
    emitidoEn: doc.emitidoEn.toISOString(),
    /** Fecha de negocio en que se emitió; es la que manda para el plazo de anulación. */
    fechaEmision: businessDateOf(doc.emitidoEn),
    emitidoPor: doc.emitidoPor,
    purchaseTransactionId: doc.purchaseTransactionId,
    saleTransactionId: doc.saleTransactionId,
    grindingServiceId: doc.grindingServiceId,
    total: Number(doc.total),
    moneda: doc.moneda,
    desglose: {
      importeExento: Number(doc.importeExento),
      importeExonerado: Number(doc.importeExonerado),
      importeGravado15: Number(doc.importeGravado15),
      importeGravado18: Number(doc.importeGravado18),
      isv15: Number(doc.isv15),
      isv18: Number(doc.isv18),
    },
    formatoVersion: doc.formatoVersion,
    anuladoEn: doc.anuladoEn?.toISOString() ?? null,
    anuladoPor: doc.anuladoPor,
    anulacionMotivo: doc.anulacionMotivo,
    copiaFisicaResguardada: doc.copiaFisicaResguardada,
    copiaFisicaUbicacion: doc.copiaFisicaUbicacion,
    // Derivado: el plazo es el mismo día de la emisión.
    anulable: doc.estado === 'emitido' && puedeAnularse(doc.emitidoEn),
    esNota: esNota(doc.tipoDocumento),
    notaMotivo: doc.notaMotivo,
    documentoOrigen: doc.documentoOrigen
      ? {
          id: doc.documentoOrigen.id,
          numeroCompleto: doc.documentoOrigen.numeroCompleto,
          tipoDocumento: doc.documentoOrigen.tipoDocumento,
          tipoDocumentoLabel: tipoDocumentoLabel(doc.documentoOrigen.tipoDocumento),
          fechaEmision: businessDateOf(doc.documentoOrigen.emitidoEn),
        }
      : null,
    notas: (doc.notas ?? []).map(mapNotaResumen),
    saldoAcreditable: saldoAcreditable(doc),
  };
}

function mapNotaResumen(nota: NotaRow): FiscalNotaResumenDTO {
  return {
    id: nota.id,
    tipoDocumento: nota.tipoDocumento,
    tipoDocumentoLabel: tipoDocumentoLabel(nota.tipoDocumento),
    numeroCompleto: nota.numeroCompleto,
    estado: nota.estado,
    total: Number(nota.total),
    notaMotivo: nota.notaMotivo,
    fechaEmision: businessDateOf(nota.emitidoEn),
  };
}

/**
 * Cuánto queda por acreditar de un documento: su total, más las notas de débito, menos
 * las de crédito. Es el techo de la próxima nota de crédito.
 *
 * Las notas **anuladas no cuentan**: anular una nota de crédito el mismo día devuelve el
 * saldo, que es justo para lo que sirve. Una nota no tiene saldo propio: lo que se
 * corrige es la factura, no la corrección.
 */
function saldoAcreditable(doc: FiscalDocumentRow): number {
  if (esNota(doc.tipoDocumento)) return 0;

  const vigentes = (doc.notas ?? []).filter((nota) => nota.estado === 'emitido');
  const saldo = vigentes.reduce(
    (acumulado, nota) => acumulado + signoLibro(nota.tipoDocumento) * Number(nota.total),
    Number(doc.total),
  );

  return Math.max(0, Math.round(saldo * 100) / 100);
}

/**
 * Lo que hace falta para armar el DTO. Las notas vienen con el documento porque la fila
 * del panel tiene que poder decir "ya se acreditó L 500 de esta factura" sin otra
 * consulta: es lo que decide si se puede emitir otra nota y por cuánto.
 */
export const fiscalDocumentInclude = {
  cai: { select: { codigo: true } },
  documentoOrigen: { select: { id: true, numeroCompleto: true, tipoDocumento: true, emitidoEn: true } },
  notas: {
    select: { id: true, tipoDocumento: true, numeroCompleto: true, estado: true, total: true, notaMotivo: true, emitidoEn: true },
    orderBy: { emitidoEn: 'desc' },
  },
} as const;

/** Campo de `FiscalDocument` que corresponde a cada origen. */
const CAMPO_ORIGEN: Record<OrigenDocumento, 'purchaseTransactionId' | 'saleTransactionId' | 'grindingServiceId'> = {
  compra: 'purchaseTransactionId',
  venta: 'saleTransactionId',
  molido: 'grindingServiceId',
};

/**
 * Bloquea la edición y el borrado de una transacción ya documentada. Es el gemelo de
 * `assertCashOpen`: un punto único que lanzan las rutas de baja.
 *
 * La base lo impide igual con `onDelete: Restrict`, pero el error de la llave
 * foránea no le dice nada a quien está en el mostrador.
 */
export async function assertSinDocumentoFiscal(
  db: DbClient,
  origen: OrigenDocumento,
  transactionId: string,
): Promise<void> {
  const documento = await db.fiscalDocument.findFirst({
    where: { [CAMPO_ORIGEN[origen]]: transactionId },
    select: { numeroCompleto: true },
  });

  if (documento) {
    throw new DocumentoEmitidoError(documento.numeroCompleto);
  }
}

/** Líneas con su clasificación fiscal, para el desglose del ISV. */
async function lineasFiscales(
  db: DbClient,
  origen: OrigenDocumento,
  transactionId: string,
): Promise<{ lineas: LineaFiscal[]; totalTransaccion: number; businessDate: Date }> {
  if (origen === 'compra') {
    const compra = await db.purchaseTransaction.findUnique({
      where: { id: transactionId },
      include: { items: { include: { producto: { select: { clasificacionFiscal: true } } } } },
    });
    if (!compra) throw new Error('Compra no encontrada.');

    return {
      lineas: compra.items.map((item) => ({
        monto: Number(item.total),
        clasificacionFiscal: item.producto.clasificacionFiscal,
      })),
      totalTransaccion: Number(compra.total),
      businessDate: compra.businessDate,
    };
  }

  if (origen === 'venta') {
    const venta = await db.saleTransaction.findUnique({
      where: { id: transactionId },
      include: { items: { include: { producto: { select: { clasificacionFiscal: true } } } } },
    });
    if (!venta) throw new Error('Venta no encontrada.');

    return {
      lineas: venta.items.map((item) => ({
        monto: Number(item.monto),
        // Una venta vieja puede no tener producto; el café está exento igual.
        clasificacionFiscal: item.producto?.clasificacionFiscal ?? 'EXENTO',
      })),
      totalTransaccion: Number(venta.total),
      businessDate: venta.businessDate,
    };
  }

  const servicio = await db.grindingService.findUnique({ where: { id: transactionId } });
  if (!servicio) throw new Error('Servicio de molido no encontrado.');

  return {
    // El monto del molido se captura con el ISV incluido, así que la base se calcula
    // hacia atrás. Es el único ingreso que no está exonerado.
    lineas: [
      {
        monto: Number(servicio.monto),
        clasificacionFiscal: CLASIFICACION_FISCAL_MOLIDO,
        isvIncluido: true,
      },
    ],
    totalTransaccion: Number(servicio.monto),
    businessDate: servicio.businessDate,
  };
}

/**
 * Acomoda el desglose al total que realmente se paga.
 *
 * En una compra, el bono y el descuento son ajustes al pie: la suma de las líneas no
 * es lo que sale de la caja. Como el café está exonerado, la diferencia se carga al
 * importe exento, de modo que el desglose cuadre con el total impreso.
 *
 * Si algún día se documenta algo gravado con ajustes al pie, hay que decidir cómo se
 * reparte esa diferencia: hoy no existe ese caso.
 */
function ajustarDesgloseAlTotal(desglose: DesgloseIsv, totalTransaccion: number): DesgloseIsv {
  const diferencia = Math.round((totalTransaccion - desglose.total) * 100) / 100;
  if (diferencia === 0) return desglose;

  return {
    ...desglose,
    importeExento: Math.round((desglose.importeExento + diferencia) * 100) / 100,
    total: totalTransaccion,
  };
}

async function snapshotDe(origen: OrigenDocumento, transactionId: string) {
  const data =
    origen === 'compra'
      ? await buildInvoiceForPurchase(transactionId)
      : origen === 'venta'
        ? await buildInvoiceForSale(transactionId)
        : await buildInvoiceForGrinding(transactionId);

  if (!data) throw new Error('No se encontró la transacción que se quiere documentar.');
  return data;
}

export type EmitirInput = {
  origen: OrigenDocumento;
  transactionId: string;
  usuario: string;
  /** Solo en modo TALONARIO: el número que trae el papel. */
  numeroManual?: number;
};

/** El CAI tal como lo devuelve el `SELECT … FOR UPDATE`, sin pasar por Prisma. */
type CaiBloqueado = {
  id: string;
  codigo: string;
  codigoEstablecimiento: string;
  codigoPuntoEmision: string;
  codigoTipoDocumento: string;
  rangoDesde: number;
  rangoHasta: number;
  fechaLimite: Date;
  modo: string;
  estado: string;
  ultimoCorrelativo: number;
  alertaPorcentaje: number;
  alertaDiasPrevios: number;
};

/**
 * Toma el siguiente número del CAI activo de un tipo y avanza el contador, con la fila
 * bloqueada.
 *
 * Lo comparten la emisión de facturas y la de notas: son series distintas —cada tipo de
 * documento tiene su propio CAI— pero la garantía tiene que ser la misma, y duplicar
 * este bloque era la forma segura de que una nota acabara con un número repetido.
 *
 * Solo se llama **dentro** de una transacción: el bloqueo dura hasta que esa transacción
 * termina, y es lo que impide que dos peticiones lean el mismo contador.
 */
async function tomarCorrelativo(
  tx: Prisma.TransactionClient,
  tipoDocumento: string,
  hoy: string,
  numeroManual?: number,
): Promise<{ cai: CaiBloqueado; correlativo: number; numeroCompleto: string }> {
  // `FOR UPDATE` serializa las emisiones de este CAI: dos peticiones simultáneas
  // esperan su turno en vez de leer el mismo contador y repetir el número.
  const filas = await tx.$queryRaw<
    CaiBloqueado[]
  >`SELECT * FROM "FiscalCai" WHERE "tipoDocumento" = ${tipoDocumento} AND "estado" = 'activo' FOR UPDATE`;

  const cai = filas[0];
  if (!cai) {
    throw new CaiNoDisponibleError(
      `No hay un CAI activo para ${tipoDocumentoLabel(tipoDocumento)}. Regístrelo en Mantenimiento → Facturación.`,
    );
  }

  const estadoCai = evaluarCai(cai, hoy);
  const motivo = motivoNoEmitible(estadoCai, cai.estado === 'activo');
  if (motivo) {
    throw new CaiNoDisponibleError(motivo);
  }

  let correlativo: number;
  if (cai.modo === 'TALONARIO') {
    if (numeroManual === undefined) {
      throw new Error('Este CAI está en modo talonario: hay que escribir el número que trae el papel.');
    }
    if (numeroManual < cai.rangoDesde || numeroManual > cai.rangoHasta) {
      throw new Error(
        `El número ${numeroManual} está fuera del rango autorizado (${cai.rangoDesde}–${cai.rangoHasta}).`,
      );
    }
    correlativo = numeroManual;
  } else {
    // `siguienteCorrelativo` no puede ser null acá: `motivoNoEmitible` ya descartó
    // vencido, agotado e inactivo.
    correlativo = estadoCai.siguienteCorrelativo as number;
  }

  // En modo talonario los números pueden llegar desordenados; el contador se queda
  // con el más alto para no volver a ofrecer uno ya usado.
  await tx.fiscalCai.update({
    where: { id: cai.id },
    data: { ultimoCorrelativo: Math.max(cai.ultimoCorrelativo, correlativo) },
  });

  return { cai, correlativo, numeroCompleto: formatNumeroFiscal({ ...cai, correlativo }) };
}

/** Bloque del CAI que se guarda en el snapshot: el vigente al emitir, no el de después. */
function caiDelSnapshot(cai: CaiBloqueado) {
  return {
    codigo: cai.codigo,
    rangoDesde: cai.rangoDesde,
    rangoHasta: cai.rangoHasta,
    fechaLimite: toBusinessDateString(cai.fechaLimite),
  };
}

/**
 * Emite el documento fiscal de una transacción.
 *
 * La fecha de emisión es **hoy y no se edita**: es lo que garantiza que el orden de
 * los números coincida con el de las fechas. La fecha de negocio de la transacción
 * se guarda aparte, porque el papel a veces se hace días después del pesaje.
 */
export async function emitirDocumentoFiscal(
  prisma: PrismaClient,
  input: EmitirInput,
): Promise<FiscalDocumentDTO> {
  const tipoDocumento = TIPO_DOCUMENTO_POR_ORIGEN[input.origen];
  const hoy = todayBusinessDate();

  // El snapshot y las líneas se preparan **antes** de abrir la transacción: son
  // lecturas de datos ya confirmados, y armarlas dentro alargaría el tiempo que el
  // CAI queda bloqueado. Con el bloqueo tomado, adentro solo quedan cinco consultas
  // rápidas, que es lo que permite que dos cajas emitiendo a la vez no se traben.
  const [snapshot, { lineas, totalTransaccion, businessDate }] = await Promise.all([
    snapshotDe(input.origen, input.transactionId),
    lineasFiscales(prisma, input.origen, input.transactionId),
  ]);

  return prisma.$transaction(async (tx) => {
    await assertSinDocumentoFiscal(tx, input.origen, input.transactionId);

    const { cai, correlativo, numeroCompleto } = await tomarCorrelativo(tx, tipoDocumento, hoy, input.numeroManual);
    const desglose = ajustarDesgloseAlTotal(desgloseIsv(lineas), totalTransaccion);

    const documento = await tx.fiscalDocument.create({
      data: {
        caiId: cai.id,
        tipoDocumento,
        correlativo,
        numeroCompleto,
        businessDate,
        emitidoPor: input.usuario,
        [CAMPO_ORIGEN[input.origen]]: input.transactionId,
        total: totalTransaccion,
        importeExento: desglose.importeExento,
        importeExonerado: desglose.importeExonerado,
        importeGravado15: desglose.importeGravado15,
        importeGravado18: desglose.importeGravado18,
        isv15: desglose.isv15,
        isv18: desglose.isv18,
        // El snapshot lleva además el CAI con el que se emitió: el bloque fiscal
        // impreso tiene que ser el de ese momento, no el que esté vigente después.
        snapshot: {
          ...snapshot,
          numeroFiscal: numeroCompleto,
          fechaEmision: hoy,
          cai: caiDelSnapshot(cai),
        } as unknown as Prisma.InputJsonValue,
        formatoVersion: FORMATO_VERSION,
      },
      include: fiscalDocumentInclude,
    });

    await tx.fiscalAuditLog.create({
      data: {
        accion: 'emision',
        fiscalDocumentId: documento.id,
        caiId: cai.id,
        usuario: input.usuario,
        detalle: { origen: input.origen, transactionId: input.transactionId, numeroCompleto, modo: cai.modo },
      },
    });

    return mapFiscalDocument(documento);
  },
  // El bloqueo de fila serializa las emisiones del mismo CAI, así que una petición
  // puede tener que esperar a las que llegaron antes. Los valores por defecto de
  // Prisma (2 s de espera, 5 s de transacción) abortarían esa cola con dos cajas
  // emitiendo a la vez.
  { maxWait: 10_000, timeout: 20_000 });
}

/** Una nota que no se puede emitir por el estado de lo que pretende corregir. */
export class NotaNoValidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotaNoValidaError';
  }
}

export type EmitirNotaInput = {
  /** Documento que se corrige. */
  documentoOrigenId: string;
  tipo: TipoNota;
  /** Monto de la nota, en positivo. Puede ser parcial. */
  monto: number;
  motivo: string;
  usuario: string;
  /** Solo en modo TALONARIO: el número que trae el papel de la nota. */
  numeroManual?: number;
};

/**
 * Arma el snapshot de la nota a partir del documento que corrige.
 *
 * La nota hereda **la empresa y el cliente tal como quedaron en el documento original**,
 * no los datos vivos: si al productor le corrigieron el nombre después, la nota tiene
 * que seguir diciendo lo mismo que la factura que corrige, o no se leen como el par que
 * son.
 *
 * Su única línea es el ajuste: el motivo como concepto y el monto como valor. No lleva
 * pesaje ni precio por libra, porque lo que se corrige es dinero, no café.
 */
function snapshotDeNota(
  origen: { snapshot: Prisma.JsonValue; numeroCompleto: string; tipoDocumento: string; emitidoEn: Date },
  input: { tipo: TipoNota; monto: number; motivo: string; hoy: string },
): Record<string, unknown> {
  const base = (origen.snapshot ?? {}) as Record<string, unknown>;
  const linea = {
    productoNombre: input.motivo,
    pesoBruto: null,
    numeroSacos: null,
    taraPorSaco: null,
    libras: 0,
    porcentajeOro: null,
    quintalesOro: null,
    precioPorLibra: null,
    precioPorQuintalOro: null,
    descripcion: `Sobre ${tipoDocumentoLabel(origen.tipoDocumento)} No. ${origen.numeroCompleto}`,
    total: input.monto,
  };

  return {
    ...base,
    kind: 'nota',
    // Sobre qué transacción era el documento corregido, solo para rotular al cliente.
    notaSobre: base.kind ?? null,
    titulo: tipoDocumentoLabel(input.tipo),
    // La nota no tiene correlativo interno propio: el del sistema es el de la
    // transacción, y ya sale impreso en el documento que se corrige.
    numeroInterno: '',
    numeroFactura: null,
    // La fecha de la operación de una nota es el día en que se emite: no hay pesaje
    // anterior que amparar.
    businessDate: input.hoy,
    metodoPago: null,
    lineas: [linea],
    subtotal: input.monto,
    bono: 0,
    bonoMotivo: null,
    descuento: 0,
    descuentoMotivo: null,
    total: input.monto,
    totalLibras: 0,
    totalQuintalesOro: null,
  };
}

/**
 * Emite una nota de crédito o de débito sobre un documento ya emitido.
 *
 * Es la única forma de corregir después del día de emisión, porque anular está limitado
 * al mismo día. La nota **no toca** el documento original —lo emitido es inmutable— sino
 * que se suma o se resta en el libro (`signoLibro`).
 *
 * Tiene su propia serie: el CAI de `nota_credito` es distinto del de `factura`, así que
 * el número sale del contador de ese CAI con el mismo bloqueo de fila.
 *
 * Las validaciones van **dentro** de la transacción, después de tomar el bloqueo: dos
 * notas de crédito simultáneas sobre la misma factura pasarían las dos la comprobación
 * del saldo si se hiciera antes, y entre las dos acreditarían más de lo facturado.
 */
export async function emitirNotaFiscal(
  prisma: PrismaClient,
  input: EmitirNotaInput,
): Promise<FiscalDocumentDTO> {
  const hoy = todayBusinessDate();
  const monto = Math.round(input.monto * 100) / 100;

  if (!(monto > 0)) {
    throw new NotaNoValidaError('El monto de la nota tiene que ser mayor que cero.');
  }
  if (input.motivo.trim().length < 4) {
    throw new NotaNoValidaError('La nota necesita un motivo: es lo que la explica ante una revisión.');
  }

  return prisma.$transaction(
    async (tx) => {
      const origen = await tx.fiscalDocument.findUnique({
        where: { id: input.documentoOrigenId },
        include: { notas: { select: { tipoDocumento: true, estado: true, total: true } } },
      });

      if (!origen) {
        throw new NotaNoValidaError('No se encontró el documento que se quiere corregir.');
      }
      // Corregir una corrección enredaría el libro sin necesidad: si la nota está mal,
      // se anula el mismo día o se emite otra sobre el documento original.
      if (esNota(origen.tipoDocumento)) {
        throw new NotaNoValidaError('No se puede emitir una nota sobre otra nota.');
      }
      // Un documento anulado ya no declara nada: no hay qué corregirle.
      if (origen.estado === 'anulado') {
        throw new NotaNoValidaError('El documento está anulado: no hace falta una nota para corregirlo.');
      }

      const vigentes = origen.notas.filter((nota) => nota.estado === 'emitido');
      const saldo =
        Math.round(
          vigentes.reduce(
            (acumulado, nota) => acumulado + signoLibro(nota.tipoDocumento) * Number(nota.total),
            Number(origen.total),
          ) * 100,
        ) / 100;

      // Acreditar más de lo facturado declararía un ingreso negativo que nunca existió.
      // La nota de débito no tiene techo: sube lo que se cobra, no lo devuelve.
      if (input.tipo === 'nota_credito' && monto > saldo) {
        throw new NotaNoValidaError(
          `La nota de crédito no puede pasar de L ${saldo.toFixed(2)}, que es lo que queda por acreditar del documento.`,
        );
      }

      const { cai, correlativo, numeroCompleto } = await tomarCorrelativo(tx, input.tipo, hoy, input.numeroManual);

      const desglose = desgloseNota(
        {
          importeExento: Number(origen.importeExento),
          importeExonerado: Number(origen.importeExonerado),
          importeGravado15: Number(origen.importeGravado15),
          importeGravado18: Number(origen.importeGravado18),
          isv15: Number(origen.isv15),
          isv18: Number(origen.isv18),
          total: Number(origen.total),
        },
        monto,
      );

      const documento = await tx.fiscalDocument.create({
        data: {
          caiId: cai.id,
          tipoDocumento: input.tipo,
          correlativo,
          numeroCompleto,
          // La nota es de hoy: no ampara un pesaje anterior.
          businessDate: parseBusinessDate(hoy),
          emitidoPor: input.usuario,
          documentoOrigenId: origen.id,
          notaMotivo: input.motivo.trim(),
          total: monto,
          importeExento: desglose.importeExento,
          importeExonerado: desglose.importeExonerado,
          importeGravado15: desglose.importeGravado15,
          importeGravado18: desglose.importeGravado18,
          isv15: desglose.isv15,
          isv18: desglose.isv18,
          snapshot: {
            ...snapshotDeNota(origen, { tipo: input.tipo, monto, motivo: input.motivo.trim(), hoy }),
            numeroFiscal: numeroCompleto,
            fechaEmision: hoy,
            cai: caiDelSnapshot(cai),
          } as unknown as Prisma.InputJsonValue,
          formatoVersion: FORMATO_VERSION,
        },
        include: fiscalDocumentInclude,
      });

      await tx.fiscalAuditLog.create({
        data: {
          accion: 'nota',
          fiscalDocumentId: documento.id,
          caiId: cai.id,
          usuario: input.usuario,
          detalle: {
            tipo: input.tipo,
            numeroCompleto,
            monto,
            motivo: input.motivo.trim(),
            documentoOrigen: origen.numeroCompleto,
            saldoAntes: saldo,
          },
        },
      });

      return mapFiscalDocument(documento);
    },
    // Mismos márgenes que la emisión: lo que domina es la cola del bloqueo del CAI.
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export type AnularInput = {
  id: string;
  usuario: string;
  motivo: string;
  copiaFisicaResguardada?: boolean;
  copiaFisicaUbicacion?: string;
};

/**
 * Anula un documento **conservando su número**: el rango no puede tener huecos, así
 * que un número emitido nunca se libera ni se reasigna.
 *
 * Solo el mismo día de la emisión. Después hace falta una nota de crédito.
 */
export async function anularDocumentoFiscal(
  prisma: PrismaClient,
  input: AnularInput,
): Promise<FiscalDocumentDTO | null> {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.fiscalDocument.findUnique({
      where: { id: input.id },
      include: { notas: { where: { estado: 'emitido' }, select: { numeroCompleto: true } } },
    });
    if (!existente) return null;

    if (existente.estado === 'anulado') {
      throw new Error('Este documento ya está anulado.');
    }
    // Anular el documento dejaría sus notas apuntando a algo que ya no declara nada, y
    // las notas siguen contando en el libro. Primero se anulan ellas.
    if (existente.notas.length > 0) {
      throw new NotaNoValidaError(
        `Este documento tiene ${existente.notas.length === 1 ? 'una nota emitida' : `${existente.notas.length} notas emitidas`} ` +
          `(${existente.notas.map((nota) => nota.numeroCompleto).join(', ')}). Anule primero las notas.`,
      );
    }
    if (!puedeAnularse(existente.emitidoEn)) {
      throw new Error(
        `Solo se puede anular el mismo día de la emisión (${businessDateOf(existente.emitidoEn)}). ` +
          'Para corregirlo después hace falta una nota de crédito.',
      );
    }

    const documento = await tx.fiscalDocument.update({
      where: { id: input.id },
      data: {
        estado: 'anulado',
        anuladoEn: new Date(),
        anuladoPor: input.usuario,
        anulacionMotivo: input.motivo,
        copiaFisicaResguardada: input.copiaFisicaResguardada ?? false,
        copiaFisicaUbicacion: input.copiaFisicaUbicacion || null,
      },
      include: fiscalDocumentInclude,
    });

    await tx.fiscalAuditLog.create({
      data: {
        accion: 'anulacion',
        fiscalDocumentId: documento.id,
        caiId: documento.caiId,
        usuario: input.usuario,
        detalle: {
          motivo: input.motivo,
          numeroCompleto: documento.numeroCompleto,
          copiaFisicaUbicacion: input.copiaFisicaUbicacion ?? null,
        },
      },
    });

    return mapFiscalDocument(documento);
  });
}

/**
 * Anota en bitácora que un documento se imprimió, con el formato usado.
 *
 * Un número emitido nunca se reasigna, así que lo único auditable de una impresión es
 * cuántas veces salió y en qué formato. No falla la impresión si esto falla: dejar sin
 * imprimir una factura por no poder escribir la bitácora sería peor.
 */
export async function registrarImpresion(
  prisma: PrismaClient,
  input: { fiscalDocumentId: string; usuario: string; formato: string },
): Promise<void> {
  try {
    const documento = await prisma.fiscalDocument.findUnique({
      where: { id: input.fiscalDocumentId },
      select: { caiId: true, numeroCompleto: true },
    });
    if (!documento) return;

    await prisma.fiscalAuditLog.create({
      data: {
        accion: 'reimpresion',
        fiscalDocumentId: input.fiscalDocumentId,
        caiId: documento.caiId,
        usuario: input.usuario,
        detalle: { formato: input.formato, numeroCompleto: documento.numeroCompleto },
      },
    });
  } catch {
    // Silencio a propósito: ver el comentario de arriba.
  }
}

export async function listFiscalDocuments(
  db: DbClient,
  filtros: { businessDate?: string; from?: string; to?: string; estado?: string },
): Promise<FiscalDocumentDTO[]> {
  const { businessDate, from, to, estado } = filtros;

  const documentos = await db.fiscalDocument.findMany({
    where: {
      ...(estado ? { estado } : {}),
      ...(businessDate
        ? { businessDate: parseBusinessDate(businessDate) }
        : from || to
          ? {
              businessDate: {
                ...(from ? { gte: parseBusinessDate(from) } : {}),
                ...(to ? { lte: parseBusinessDate(to) } : {}),
              },
            }
          : {}),
    },
    orderBy: [{ emitidoEn: 'desc' }],
    include: fiscalDocumentInclude,
  });

  return documentos.map(mapFiscalDocument);
}
