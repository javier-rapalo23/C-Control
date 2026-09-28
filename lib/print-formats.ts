/**
 * Formatos de impresión de la factura.
 *
 * El ticket de 80 mm y la hoja A4 son **el mismo documento fiscal** impreso de dos
 * maneras: llevan el mismo número, el mismo CAI y el mismo desglose. No son dos
 * documentos, así que emitir no depende del formato y cambiar de formato no emite
 * nada nuevo.
 *
 * Cuál se usa por omisión se configura en Mantenimiento → Facturación; en cada fila
 * se puede imprimir el otro para un caso suelto.
 */

export const PRINT_FORMATS = [
  { key: 'a4', label: 'Hoja A4', descripcion: 'Impresora normal, por el diálogo del navegador' },
  { key: 'termico80', label: 'Ticket 80 mm', descripcion: 'Impresora térmica de red, por el agente local' },
] as const;

export type PrintFormat = (typeof PRINT_FORMATS)[number]['key'];

export const PRINT_FORMAT_KEYS = PRINT_FORMATS.map((formato) => formato.key) as [string, ...string[]];

export const DEFAULT_PRINT_FORMAT: PrintFormat = 'a4';

export function printFormatLabel(key: string): string {
  return PRINT_FORMATS.find((formato) => formato.key === key)?.label ?? key;
}

/** El formato que no se está usando, para ofrecer el cambio puntual. */
export function otherPrintFormat(key: string): PrintFormat {
  return key === 'termico80' ? 'a4' : 'termico80';
}

export function isPrintFormat(value: string): value is PrintFormat {
  return PRINT_FORMAT_KEYS.includes(value);
}
