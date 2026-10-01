import { businessDateOf, parseBusinessDate, todayBusinessDate, toBusinessDateString } from '@/lib/business-date';

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

/** Sobre qué se emite un documento. */
export type OrigenDocumento = 'compra' | 'venta' | 'molido';

/**
 * Qué tipo de documento le corresponde a cada origen. Es un mapa explícito y no una
 * búsqueda por `aplicaA` porque las notas de crédito también aplican a una venta:
 * elegir por coincidencia daría una nota de crédito donde va una factura.
 */
export const TIPO_DOCUMENTO_POR_ORIGEN: Record<OrigenDocumento, string> = {
  compra: 'boleta_compra',
  venta: 'factura',
  molido: 'factura',
};

/**
 * Anular solo se permite **el mismo día de la emisión** (decisión del 27/09/2026).
 * Después hace falta una nota de crédito o de débito (`emitirNotaFiscal`).
 *
 * Se compara en fecha de negocio: con la hora del servidor, un documento emitido a
 * las 19:00 de Honduras ya contaría como "de ayer" a las 18:01 del día siguiente.
 */
export function puedeAnularse(emitidoEn: Date, hoy: string = todayBusinessDate()): boolean {
  return businessDateOf(emitidoEn) === hoy;
}

export type LineaFiscal = {
  /** Monto de la línea tal como se cobra o se paga. */
  monto: number;
  clasificacionFiscal: string;
  /**
   * Si el monto ya trae el ISV dentro. Es el caso del molido: se captura un monto
   * único y el impuesto va incluido, así que la base se calcula hacia atrás.
   */
  isvIncluido?: boolean;
};

export type DesgloseIsv = {
  importeExento: number;
  importeExonerado: number;
  importeGravado15: number;
  importeGravado18: number;
  isv15: number;
  isv18: number;
  total: number;
};

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Desglose de totales para el pie del documento.
 *
 * Con `isvIncluido`, el ISV sale como **la diferencia** entre el monto y la base
 * redondeada, no de multiplicar la base por la tasa: así base + ISV da exactamente
 * el monto cobrado y el documento no descuadra por un centavo.
 */
export function desgloseIsv(lineas: LineaFiscal[]): DesgloseIsv {
  const desglose: DesgloseIsv = {
    importeExento: 0,
    importeExonerado: 0,
    importeGravado15: 0,
    importeGravado18: 0,
    isv15: 0,
    isv18: 0,
    total: 0,
  };

  for (const linea of lineas) {
    const tasa = tasaIsv(linea.clasificacionFiscal);
    desglose.total = redondear(desglose.total + linea.monto);

    if (tasa === 0) {
      if (linea.clasificacionFiscal === 'EXONERADO') {
        desglose.importeExonerado = redondear(desglose.importeExonerado + linea.monto);
      } else {
        desglose.importeExento = redondear(desglose.importeExento + linea.monto);
      }
      continue;
    }

    const base = linea.isvIncluido ? redondear(linea.monto / (1 + tasa)) : redondear(linea.monto);
    const impuesto = linea.isvIncluido ? redondear(linea.monto - base) : redondear(base * tasa);

    if (tasa === 0.18) {
      desglose.importeGravado18 = redondear(desglose.importeGravado18 + base);
      desglose.isv18 = redondear(desglose.isv18 + impuesto);
    } else {
      desglose.importeGravado15 = redondear(desglose.importeGravado15 + base);
      desglose.isv15 = redondear(desglose.isv15 + impuesto);
    }

    // Sin `isvIncluido` el impuesto se suma sobre el monto de la línea.
    if (!linea.isvIncluido) {
      desglose.total = redondear(desglose.total + impuesto);
    }
  }

  return desglose;
}

/**
 * Los dos tipos que **modifican un documento ya emitido**, en vez de amparar una
 * transacción. Son la única forma de corregir después del día de emisión, porque la
 * anulación está limitada al mismo día (`puedeAnularse`).
 */
export const TIPOS_NOTA = ['nota_credito', 'nota_debito'] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export function esNota(tipoDocumento: string): boolean {
  return (TIPOS_NOTA as readonly string[]).includes(tipoDocumento);
}

/**
 * Con qué signo entra el documento al libro.
 *
 * La nota de crédito **resta**: devuelve o rebaja lo que la factura declaró. La de
 * débito suma. Los montos se guardan siempre en positivo —es como se imprimen, "nota
 * de crédito por L 500.00"— y el signo se aplica al sumar el libro. Guardarlos
 * negativos haría ilegible el documento impreso.
 */
export function signoLibro(tipoDocumento: string): 1 | -1 {
  return tipoDocumento === 'nota_credito' ? -1 : 1;
}

/**
 * Desglose de una nota por `monto`, prorrateado desde el documento que modifica.
 *
 * Acreditar la mitad de una factura acredita la mitad de cada renglón: si el original
 * llevaba ISV, la nota tiene que llevar su parte, o el impuesto declarado no cuadra.
 *
 * El renglón más grande del original **absorbe el resto** en vez de prorratearse: así
 * la suma de los renglones da exactamente el monto de la nota, sin el centavo de
 * diferencia que deja redondear cada parte por separado. Y como el total del original
 * trae el ISV dentro, la parte gravada se descompone hacia atrás, igual que el molido.
 */
export function desgloseNota(origen: DesgloseIsv, monto: number): DesgloseIsv {
  const total = redondear(monto);
  const vacio: DesgloseIsv = {
    importeExento: 0,
    importeExonerado: 0,
    importeGravado15: 0,
    importeGravado18: 0,
    isv15: 0,
    isv18: 0,
    total,
  };

  // Sin total original no hay proporción que aplicar. No debería ocurrir —un documento
  // con total 0 no se emite— pero dejar el monto fuera del desglose sí sería un error.
  if (origen.total <= 0) return { ...vacio, importeExento: total };

  // Lo que cada clasificación aportó al total del original, con su ISV incluido.
  const aportes = [
    origen.importeExento,
    origen.importeExonerado,
    redondear(origen.importeGravado15 + origen.isv15),
    redondear(origen.importeGravado18 + origen.isv18),
  ];

  const mayor = aportes.indexOf(Math.max(...aportes));
  const ratio = total / origen.total;

  const partes = aportes.map((aporte, indice) => (indice === mayor ? 0 : redondear(aporte * ratio)));
  partes[mayor] = redondear(total - partes.reduce((suma, parte) => suma + parte, 0));

  const [exento, exonerado, bruto15, bruto18] = partes;
  const base15 = redondear(bruto15 / 1.15);
  const base18 = redondear(bruto18 / 1.18);

  return {
    importeExento: exento,
    importeExonerado: exonerado,
    importeGravado15: base15,
    importeGravado18: base18,
    isv15: redondear(bruto15 - base15),
    isv18: redondear(bruto18 - base18),
    total,
  };
}

/**
 * Los renglones del pie fiscal, en el orden en que van impresos.
 *
 * **Se imprimen todos, siempre, incluso en cero** (requisito de la contadora del
 * 29/09/2026): el formato del SAR los lleva preimpresos, y una factura a la que le falta
 * el renglón de ISV no se lee como completa aunque el monto fuera cero.
 *
 * Están acá y no en cada maquetación porque el ticket de 80 mm y la hoja A4 son el mismo
 * documento: si cada uno tuviera su lista, un renglón nuevo entraría en uno y no en el
 * otro. El `label` es para la hoja, que tiene espacio; el `labelTicket` cabe en 32
 * columnas.
 */
export const RENGLONES_DESGLOSE = [
  { key: 'importeExento', label: 'Importe exento', labelTicket: 'Importe exento:' },
  { key: 'importeExonerado', label: 'Importe exonerado', labelTicket: 'Importe exonerado:' },
  { key: 'importeGravado15', label: 'Importe gravado 15 %', labelTicket: 'Gravado 15%:' },
  { key: 'isv15', label: 'ISV 15 %', labelTicket: 'ISV 15%:' },
  { key: 'importeGravado18', label: 'Importe gravado 18 %', labelTicket: 'Gravado 18%:' },
  { key: 'isv18', label: 'ISV 18 %', labelTicket: 'ISV 18%:' },
] as const satisfies ReadonlyArray<{ key: keyof Omit<DesgloseIsv, 'total'>; label: string; labelTicket: string }>;

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
