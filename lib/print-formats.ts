/**
 * Formatos de impresión de la factura.
 *
 * La hoja A4 y el papel continuo son **el mismo documento fiscal** impreso de dos
 * maneras: llevan el mismo número, el mismo CAI y el mismo desglose. No son dos
 * documentos, así que emitir no depende del formato y cambiar de formato no emite
 * nada nuevo. Los dos se imprimen desde el navegador, con su diálogo de impresión.
 *
 * El papel continuo es carta continua de 9.5" × 11", en blanco y **con copias**: la
 * impresora saca original y copia de una sola pasada, así que se manda una sola hoja.
 * En A4 van dos, la del cliente y la del control interno.
 *
 * El ticket térmico de 80 mm se dejó de usar el 02/10/2026 y se quitó con todo su
 * agente de impresión.
 *
 * Cuál se usa por omisión se configura en Mantenimiento → Facturación.
 */

export const PRINT_FORMATS = [
  { key: 'a4', label: 'Hoja A4', descripcion: 'Impresora normal; original y copia en dos hojas' },
  {
    key: 'continuo',
    label: 'Papel continuo',
    descripcion: 'Carta continua 9.5" × 11" con copias; una sola hoja',
  },
] as const;

export type PrintFormat = (typeof PRINT_FORMATS)[number]['key'];

export const PRINT_FORMAT_KEYS = PRINT_FORMATS.map((formato) => formato.key) as [string, ...string[]];

export const DEFAULT_PRINT_FORMAT: PrintFormat = 'a4';

export function printFormatLabel(key: string): string {
  return PRINT_FORMATS.find((formato) => formato.key === key)?.label ?? key;
}

/** El formato que no se está usando, para ofrecer el cambio puntual. */
export function otherPrintFormat(key: string): PrintFormat {
  return key === 'continuo' ? 'a4' : 'continuo';
}

export function isPrintFormat(value: string): value is PrintFormat {
  return PRINT_FORMAT_KEYS.includes(value);
}

/** Lee el formato de un parámetro de URL; cualquier otra cosa es A4. */
export function parsePrintFormat(value: string | string[] | undefined | null): PrintFormat {
  const valor = Array.isArray(value) ? value[0] : value;
  return valor && isPrintFormat(valor) ? valor : DEFAULT_PRINT_FORMAT;
}
