import { Prisma, PrismaClient } from '@prisma/client';
import { businessDateOf, parseBusinessDate, todayBusinessDate, toBusinessDateString } from '@/lib/business-date';
import {
  CLASIFICACION_FISCAL_MOLIDO,
  type DesgloseIsv,
  type LineaFiscal,
  type OrigenDocumento,
  TIPO_DOCUMENTO_POR_ORIGEN,
  desgloseIsv,
  evaluarCai,
  formatNumeroFiscal,
  motivoNoEmitible,
  puedeAnularse,
  tipoDocumentoLabel,
} from '@/lib/fiscal';
import { buildInvoiceForGrinding, buildInvoiceForPurchase, buildInvoiceForSale } from '@/lib/build-invoice';
import type { FiscalDocumentDTO } from '@/types/domain';

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
  cai?: { codigo: string } | null;
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
  };
}

export const fiscalDocumentInclude = { cai: { select: { codigo: true } } } as const;

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

    // `FOR UPDATE` serializa las emisiones de este CAI: dos peticiones simultáneas
    // esperan su turno en vez de leer el mismo contador y repetir el número.
    const filas = await tx.$queryRaw<
      Array<{
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
      }>
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
      if (input.numeroManual === undefined) {
        throw new Error('Este CAI está en modo talonario: hay que escribir el número que trae el papel.');
      }
      if (input.numeroManual < cai.rangoDesde || input.numeroManual > cai.rangoHasta) {
        throw new Error(
          `El número ${input.numeroManual} está fuera del rango autorizado (${cai.rangoDesde}–${cai.rangoHasta}).`,
        );
      }
      correlativo = input.numeroManual;
    } else {
      // `siguienteCorrelativo` no puede ser null acá: `motivoNoEmitible` ya descartó
      // vencido, agotado e inactivo.
      correlativo = estadoCai.siguienteCorrelativo as number;
    }

    const desglose = ajustarDesgloseAlTotal(desgloseIsv(lineas), totalTransaccion);
    const numeroCompleto = formatNumeroFiscal({ ...cai, correlativo });

    // En modo talonario los números pueden llegar desordenados; el contador se queda
    // con el más alto para no volver a ofrecer uno ya usado.
    await tx.fiscalCai.update({
      where: { id: cai.id },
      data: { ultimoCorrelativo: Math.max(cai.ultimoCorrelativo, correlativo) },
    });

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
          cai: {
            codigo: cai.codigo,
            rangoDesde: cai.rangoDesde,
            rangoHasta: cai.rangoHasta,
            fechaLimite: toBusinessDateString(cai.fechaLimite),
          },
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
    const existente = await tx.fiscalDocument.findUnique({ where: { id: input.id } });
    if (!existente) return null;

    if (existente.estado === 'anulado') {
      throw new Error('Este documento ya está anulado.');
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
