import { parseBusinessDate, todayBusinessDate, toBusinessDateString } from '@/lib/business-date';

/**
 * Catálogos y reglas de la facturación fiscal (SAR), sin base de datos.
 *
 * Todo lo que el SAR puede cambiar —el tipo de documento autorizado, su código de
 * dos dígitos, los códigos de establecimiento y punto de emisión, el rango y la
 * fecha límite— es **configuración del CAI**, no constantes de este archivo: lo
 * trae la contadora y se carga en Mantenimiento. Acá vive solo lo que no cambia:
 * qué tipos de documento existen, cómo se calcula el ISV de cada clasificación, y
 * cómo se decide si un CAI todavía puede emitir.
 *
 * Mismo criterio que `lib/expenses.ts` y `lib/payment-methods.ts`: catálogo cerrado
 * en TypeScript, validado con Zod, guardado como texto. No hay `enum` de Prisma.
 */

export type TipoDocumentoFiscal = {
  key: string;
  label: string;
  /** Sobre qué se emite. Un documento ampara una sola transacción (§8.5 del plan). */
  aplicaA: Array<'compra' | 'venta' | 'molido'>;
};

/**
 * Los cuatro primeros son los que el negocio necesita; nota de crédito y débito
 * quedan declaradas porque son la única forma de corregir un documento después del
 * día de emisión, y la guía de remisión porque está prevista para más adelante.
 */
export const TIPOS_DOCUMENTO_FISCAL: TipoDocumentoFiscal[] = [
  { key: 'boleta_compra', label: 'Boleta de compra', aplicaA: ['compra'] },
  { key: 'factura', label: 'Factura', aplicaA: ['venta', 'molido'] },
  { key: 'nota_credito', label: 'Nota de crédito', aplicaA: ['venta', 'molido'] },
  { key: 'nota_debito', label: 'Nota de débito', aplicaA: ['venta', 'molido'] },
  { key: 'guia_remision', label: 'Guía de remisión', aplicaA: [] },
];

export const TIPO_DOCUMENTO_KEYS = TIPOS_DOCUMENTO_FISCAL.map((tipo) => tipo.key) as [string, ...string[]];

export function findTipoDocumento(key: string): TipoDocumentoFiscal | undefined {
  return TIPOS_DOCUMENTO_FISCAL.find((tipo) => tipo.key === key);
}

export function tipoDocumentoLabel(key: string): string {
  return findTipoDocumento(key)?.label ?? key;
}

export type ClasificacionFiscal = {
  key: string;
  label: string;
  /** Tasa como fracción: 0.15 es el 15 %. */
  tasaIsv: number;
};

/**
 * El café en uva, pergamino y oro está exonerado, así que casi todo cae en
 * `EXENTO`. La excepción es el **servicio de molido**, que no es café: es maquila y
 * va gravada.
 */
export const CLASIFICACIONES_FISCALES: ClasificacionFiscal[] = [
  { key: 'EXENTO', label: 'Exento', tasaIsv: 0 },
  { key: 'EXONERADO', label: 'Exonerado', tasaIsv: 0 },
  { key: 'GRAVADO_15', label: 'Gravado 15 %', tasaIsv: 0.15 },
  { key: 'GRAVADO_18', label: 'Gravado 18 %', tasaIsv: 0.18 },
];

export const CLASIFICACION_FISCAL_KEYS = CLASIFICACIONES_FISCALES.map((c) => c.key) as [string, ...string[]];

/** Lo que llevan los productos mientras nadie lo cambie: café exonerado del ISV. */
export const CLASIFICACION_FISCAL_DEFAULT = 'EXENTO';

/** El molido no es un `Producto`, así que su clasificación no sale del catálogo de productos. */
export const CLASIFICACION_FISCAL_MOLIDO = 'GRAVADO_15';

export function tasaIsv(clasificacion: string): number {
  return CLASIFICACIONES_FISCALES.find((c) => c.key === clasificacion)?.tasaIsv ?? 0;
}

export const MODOS_CAI = ['TALONARIO', 'SISTEMA'] as const;
export type ModoCai = (typeof MODOS_CAI)[number];

export const ESTADOS_CAI = ['activo', 'inactivo'] as const;
export type EstadoCaiConfigurado = (typeof ESTADOS_CAI)[number];

/** Longitud del correlativo impreso. Los ocho dígitos son del formato del SAR. */
const CORRELATIVO_DIGITOS = 8;

export type NumeroFiscalPartes = {
  codigoEstablecimiento: string;
  codigoPuntoEmision: string;
  codigoTipoDocumento: string;
  correlativo: number;
};

/** `EEE-PPP-TT-CCCCCCCC`. */
export function formatNumeroFiscal(partes: NumeroFiscalPartes): string {
  const { codigoEstablecimiento, codigoPuntoEmision, codigoTipoDocumento, correlativo } = partes;
  return [
    codigoEstablecimiento.padStart(3, '0'),
    codigoPuntoEmision.padStart(3, '0'),
    codigoTipoDocumento.padStart(2, '0'),
    String(correlativo).padStart(CORRELATIVO_DIGITOS, '0'),
  ].join('-');
}

/** Datos del CAI que hacen falta para juzgar si puede emitir. */
export type CaiParaEvaluar = {
  rangoDesde: number;
  rangoHasta: number;
  /** Fecha límite de emisión, como fecha de negocio. */
  fechaLimite: Date | string;
  ultimoCorrelativo: number;
  estado: string;
  alertaPorcentaje: number;
  alertaDiasPrevios: number;
};

export type EstadoCai = {
  total: number;
  usados: number;
  disponibles: number;
  porcentajeUsado: number;
  /** Negativo si la fecha límite ya pasó. */
  diasParaVencer: number;
  vencido: boolean;
  agotado: boolean;
  /** Se cruzó el umbral de rango consumido. */
  alertaRango: boolean;
  /** Falta poco para la fecha límite. */
  alertaVencimiento: boolean;
  puedeEmitir: boolean;
  /** Número que le tocaría al próximo documento; null si ya no se puede emitir. */
  siguienteCorrelativo: number | null;
};

const MS_POR_DIA = 86_400_000;

/**
 * Evalúa un CAI contra una fecha de negocio.
 *
 * El vencimiento se compara en **fecha de negocio** (`America/Tegucigalpa`) y no
 * con `new Date()`: usando la hora del servidor, que corre en UTC, un CAI que vence
 * hoy seguiría aceptando documentos durante las primeras horas del día siguiente.
 */
export function evaluarCai(cai: CaiParaEvaluar, hoyInput: string = todayBusinessDate()): EstadoCai {
  const hoy = parseBusinessDate(hoyInput);
  const limite =
    typeof cai.fechaLimite === 'string'
      ? parseBusinessDate(cai.fechaLimite)
      : parseBusinessDate(toBusinessDateString(cai.fechaLimite));

  const total = Math.max(0, cai.rangoHasta - cai.rangoDesde + 1);
  // `ultimoCorrelativo` vale 0 en un CAI sin usar, aunque su rango empiece en otro
  // número: por eso se compara contra `rangoDesde` en vez de restar directo.
  const ultimo = Math.max(cai.ultimoCorrelativo, cai.rangoDesde - 1);
  const usados = Math.max(0, Math.min(ultimo, cai.rangoHasta) - (cai.rangoDesde - 1));
  const disponibles = Math.max(0, total - usados);
  const porcentajeUsado = total === 0 ? 100 : Math.round((usados / total) * 100);

  const diasParaVencer = Math.round((limite.getTime() - hoy.getTime()) / MS_POR_DIA);
  const vencido = diasParaVencer < 0;
  const agotado = disponibles === 0;
  const activo = cai.estado === 'activo';
  const puedeEmitir = activo && !vencido && !agotado;

  return {
    total,
    usados,
    disponibles,
    porcentajeUsado,
    diasParaVencer,
    vencido,
    agotado,
    alertaRango: porcentajeUsado >= cai.alertaPorcentaje,
    alertaVencimiento: !vencido && diasParaVencer <= cai.alertaDiasPrevios,
    puedeEmitir,
    siguienteCorrelativo: puedeEmitir ? ultimo + 1 : null,
  };
}

/**
 * Motivo por el que un CAI no puede emitir, listo para mostrar. Null si sí puede.
 * Se usa tanto en el panel como en el error de la emisión, para que digan lo mismo.
 */
export function motivoNoEmitible(estado: EstadoCai, activo: boolean): string | null {
  if (!activo) return 'El CAI está inactivo.';
  if (estado.vencido) return 'La fecha límite de emisión del CAI ya pasó.';
  if (estado.agotado) return 'El rango autorizado del CAI está agotado.';
  return null;
}
