import ExcelJS from 'exceljs';

/**
 * Libros de Excel (.xlsx) para descargar.
 *
 * Es el gemelo de `lib/csv.ts` y existe por una razón concreta: un reporte de negocio no
 * es **una** tabla sino varias —totales, por período, por producto, por cliente—, y en un
 * CSV quedarían una debajo de la otra en la misma hoja. Acá cada tabla es una pestaña.
 *
 * Los reportes declaran **datos y formato de columna**, no celdas: el tipo de dato lo
 * decide `formato`, y de ahí sale que un monto entre como número y se pueda sumar en
 * Excel en vez de llegar como texto.
 *
 * A diferencia del CSV, acá **no hace falta proteger contra fórmulas**: una cadena se
 * escribe como celda de texto y Excel no la evalúa. En un CSV sí, porque todo es texto y
 * Excel decide al abrirlo.
 */

/** Cómo se escribe la columna. Decide el tipo de celda y el formato de número. */
export type ColumnFormat = 'texto' | 'moneda' | 'numero' | 'entero' | 'porcentaje';

export type SheetColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Por omisión, `texto`. */
  formato?: ColumnFormat;
  /** Ancho en caracteres. Por omisión se calcula del encabezado. */
  width?: number;
};

export type Sheet<T> = {
  /** Nombre de la pestaña. Se recorta y se limpia: Excel no acepta todo (ver `nombreDeHoja`). */
  nombre: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /** Nota que se escribe arriba de la tabla; sirve para el período del reporte. */
  nota?: string;
};

const FORMATOS_NUMERO: Record<Exclude<ColumnFormat, 'texto'>, string> = {
  moneda: '#,##0.00',
  numero: '#,##0.00',
  entero: '#,##0',
  porcentaje: '0.0',
};

/**
 * Excel rechaza los nombres de hoja con `: \ / ? * [ ]`, y corta a 31 caracteres. Un
 * nombre inválido no da error al escribir: rompe el archivo al abrirlo, que es peor.
 */
export function nombreDeHoja(nombre: string): string {
  const limpio = nombre.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (limpio || 'Hoja').slice(0, 31);
}

function escribirHoja<T>(libro: ExcelJS.Workbook, hoja: Sheet<T>): void {
  const worksheet = libro.addWorksheet(nombreDeHoja(hoja.nombre));

  // La nota va arriba de la tabla, no en el nombre de la hoja: ahí no cabe el período.
  if (hoja.nota) {
    const fila = worksheet.addRow([hoja.nota]);
    fila.font = { italic: true, color: { argb: 'FF555555' } };
    worksheet.addRow([]);
  }

  const encabezado = worksheet.addRow(hoja.columns.map((column) => column.header));
  encabezado.font = { bold: true };
  encabezado.border = { bottom: { style: 'thin' } };

  for (const row of hoja.rows) {
    worksheet.addRow(
      hoja.columns.map((column) => {
        const valor = column.value(row);
        if (valor === null || valor === undefined) return null;
        // Un número que no es finito (NaN, Infinity) rompería la celda: mejor vacía.
        if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
        return valor;
      }),
    );
  }

  hoja.columns.forEach((column, indice) => {
    const worksheetColumn = worksheet.getColumn(indice + 1);
    worksheetColumn.width = column.width ?? Math.max(12, column.header.length + 2);
    if (column.formato && column.formato !== 'texto') {
      worksheetColumn.numFmt = FORMATOS_NUMERO[column.formato];
    }
  });

  // La fila de encabezados queda fija: un libro de compras de un mes no cabe en pantalla
  // y sin esto se pierde de vista qué columna es cuál.
  worksheet.views = [{ state: 'frozen', ySplit: encabezado.number }];
}

/** Hoja de pares etiqueta/valor, para los totales de un reporte. */
export type TotalesSheet = {
  nombre: string;
  nota?: string;
  filas: Array<{ etiqueta: string; valor: string | number; formato?: ColumnFormat }>;
};

function escribirTotales(libro: ExcelJS.Workbook, hoja: TotalesSheet): void {
  const worksheet = libro.addWorksheet(nombreDeHoja(hoja.nombre));

  if (hoja.nota) {
    const fila = worksheet.addRow([hoja.nota]);
    fila.font = { italic: true, color: { argb: 'FF555555' } };
    worksheet.addRow([]);
  }

  for (const { etiqueta, valor, formato } of hoja.filas) {
    const fila = worksheet.addRow([etiqueta, typeof valor === 'number' && !Number.isFinite(valor) ? null : valor]);
    fila.getCell(1).font = { bold: true };
    if (formato && formato !== 'texto') {
      fila.getCell(2).numFmt = FORMATOS_NUMERO[formato];
    }
  }

  worksheet.getColumn(1).width = 34;
  worksheet.getColumn(2).width = 18;
}

/**
 * Arma el libro. El orden de `hojas` es el orden de las pestañas, y conviene que la
 * primera sea la de totales: es lo que se mira al abrir el archivo.
 */
export async function buildWorkbook(hojas: Array<Sheet<never> | TotalesSheet>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'C-Control';
  libro.created = new Date();

  for (const hoja of hojas) {
    if ('filas' in hoja) {
      escribirTotales(libro, hoja);
      continue;
    }
    // El tipo de la fila se borra al meter la hoja en el libro: cada reporte tiene el
    // suyo y acá solo se recorren columnas. `sheet()` es lo que lo borra de forma segura.
    escribirHoja(libro, hoja as unknown as Sheet<unknown>);
  }

  // Un libro sin hojas no se puede abrir, y pasa si un reporte sale vacío.
  if (libro.worksheets.length === 0) {
    libro.addWorksheet('Sin datos');
  }

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Tipo declarado por una hoja cualquiera, para poder mezclarlas en un mismo libro. */
export function sheet<T>(hoja: Sheet<T>): Sheet<never> {
  return hoja as unknown as Sheet<never>;
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Respuesta de descarga. No pasa por `success()`: el cuerpo es el archivo, no el sobre
 * `{ ok, data }` del resto de la API.
 */
export function xlsxResponse(filename: string, buffer: Buffer): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      // El reporte cambia con cada movimiento: servirlo de caché daría datos viejos.
      'Cache-Control': 'no-store',
    },
  });
}
