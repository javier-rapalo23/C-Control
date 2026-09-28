/**
 * Armado de CSV para descargar.
 *
 * Es un archivo propio y no una plantilla suelta en cada reporte porque las tres
 * reglas que hacen que un CSV abra bien en el Excel de la contadora son fáciles de
 * olvidar y silenciosas cuando faltan:
 *
 * 1. **BOM.** Sin él, Excel en Windows abre el archivo con la codificación del
 *    sistema y "Bodega San Juan" sale como "Bodega San JuÃ¡n".
 * 2. **Fin de línea `\r\n`.** Es lo que pide el formato y lo que Excel espera.
 * 3. **Comillas.** Un nombre con coma parte la fila en dos columnas si no se cita.
 *
 * Los números se escriben sin formato (`1234.56`, punto decimal y sin separador de
 * miles) para que entren como número y no como texto: el total lo suma Excel, no
 * este archivo.
 */

export type CsvColumn<T> = {
  header: string;
  /**
   * Un `number` se escribe tal cual, para que Excel lo trate como número. Un
   * `string` se considera texto y se protege (ver `escaparCampo`).
   */
  value: (row: T) => string | number | null | undefined;
};

const SEPARADOR = ',';
const FIN_DE_LINEA = '\r\n';
const BOM = '﻿';

/** Caracteres con los que Excel interpreta un campo de texto como fórmula. */
const INICIOS_DE_FORMULA = ['=', '+', '-', '@'];

function escaparCampo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';

  // Los números pasan sin tocar: citarlos o prefijarlos los volvería texto y Excel
  // ya no los sumaría.
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor) : '';
  }

  // Un nombre de cliente que empiece con `=` o `+` lo ejecutaría Excel como
  // fórmula. Se le antepone una comilla simple, que Excel no muestra en la celda.
  const texto = INICIOS_DE_FORMULA.some((inicio) => valor.startsWith(inicio)) ? `'${valor}` : valor;

  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes('\n') || texto.includes('\r')) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lineas = [
    columns.map((column) => escaparCampo(column.header)).join(SEPARADOR),
    ...rows.map((row) => columns.map((column) => escaparCampo(column.value(row))).join(SEPARADOR)),
  ];

  return BOM + lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}

/**
 * Respuesta de descarga. No pasa por `success()` a propósito: el cuerpo es el
 * archivo, no el sobre `{ ok, data }` que devuelve el resto de la API.
 */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // El reporte cambia con cada emisión: servirlo de caché mostraría un libro viejo.
      'Cache-Control': 'no-store',
    },
  });
}
