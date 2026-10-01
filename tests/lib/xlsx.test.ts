import ExcelJS from 'exceljs';
import { buildWorkbook, nombreDeHoja, sheet, type TotalesSheet } from '@/lib/xlsx';

/**
 * El libro se prueba **leyéndolo de vuelta**: lo que importa no es el objeto que se armó
 * sino lo que Excel va a encontrar en el archivo, y en particular que un monto llegue
 * como número —para poder sumarlo— y no como texto.
 */

type Fila = { cliente: string; total: number; compras: number; nota: string | null };

const FILAS: Fila[] = [
  { cliente: 'Juan Pérez', total: 1234.56, compras: 3, nota: null },
  { cliente: 'Pérez, Juan', total: -50.25, compras: 1, nota: 'Ajuste' },
];

/**
 * La hoja se arma con una función y no se clona con `...`: `sheet()` borra el tipo de la
 * fila a propósito, así que una hoja ya armada no se puede volver a pasar por `sheet()`.
 */
const hojaDe = (rows: Fila[], nota?: string) =>
  sheet<Fila>({
    nombre: 'Por cliente',
    nota,
    columns: [
      { header: 'Cliente', value: (row) => row.cliente },
      { header: 'Total', value: (row) => row.total, formato: 'moneda' },
      { header: 'Compras', value: (row) => row.compras, formato: 'entero' },
      { header: 'Nota', value: (row) => row.nota },
    ],
    rows,
  });

const HOJA = hojaDe(FILAS, 'Período de prueba');

async function leer(buffer: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

describe('buildWorkbook', () => {
  it('escribe una hoja por tabla, con su nombre', async () => {
    const totales: TotalesSheet = {
      nombre: 'Totales',
      filas: [{ etiqueta: 'Total pagado', valor: 1184.31, formato: 'moneda' }],
    };

    const libro = await leer(await buildWorkbook([totales, HOJA]));

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Totales', 'Por cliente']);
  });

  it('los montos entran como número, no como texto', async () => {
    const libro = await leer(await buildWorkbook([HOJA]));
    const hoja = libro.getWorksheet('Por cliente')!;

    // Fila 1: la nota. Fila 2: vacía. Fila 3: encabezados. Fila 4: el primer dato.
    const primera = hoja.getRow(4);
    expect(primera.getCell(1).value).toBe('Juan Pérez');
    expect(primera.getCell(2).value).toBe(1234.56);
    expect(typeof primera.getCell(2).value).toBe('number');
    expect(primera.getCell(3).value).toBe(3);
    // Una celda sin valor queda vacía, no con la cadena "null".
    expect(primera.getCell(4).value).toBeNull();
  });

  it('el formato de la columna hace que el monto se vea con separador de miles', async () => {
    const libro = await leer(await buildWorkbook([HOJA]));
    const hoja = libro.getWorksheet('Por cliente')!;

    expect(hoja.getColumn(2).numFmt).toBe('#,##0.00');
    expect(hoja.getColumn(3).numFmt).toBe('#,##0');
    // La columna de texto no lleva formato de número.
    expect(hoja.getColumn(1).numFmt).toBeUndefined();
  });

  // En un CSV un campo con coma parte la fila; acá no existe ese problema, y conviene
  // que quede fijado para que nadie vuelva a citar valores a mano.
  it('un valor con coma o comilla se guarda tal cual', async () => {
    const libro = await leer(await buildWorkbook([HOJA]));
    const hoja = libro.getWorksheet('Por cliente')!;

    expect(hoja.getRow(5).getCell(1).value).toBe('Pérez, Juan');
    expect(hoja.getRow(5).getCell(2).value).toBe(-50.25);
  });

  it('el encabezado va en negrita y queda fijo al desplazar', async () => {
    const libro = await leer(await buildWorkbook([HOJA]));
    const hoja = libro.getWorksheet('Por cliente')!;

    expect(hoja.getRow(3).font?.bold).toBe(true);
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
  });

  // Un libro sin hojas no se puede abrir, y pasa si un reporte sale vacío.
  it('un libro sin hojas trae una hoja vacía en vez de romperse', async () => {
    const libro = await leer(await buildWorkbook([]));

    expect(libro.worksheets).toHaveLength(1);
    expect(libro.worksheets[0].name).toBe('Sin datos');
  });

  it('una tabla sin filas deja solo el encabezado', async () => {
    const libro = await leer(await buildWorkbook([hojaDe([])]));
    const hoja = libro.getWorksheet('Por cliente')!;

    expect(hoja.getRow(1).getCell(1).value).toBe('Cliente');
    expect(hoja.rowCount).toBe(1);
  });

  it('un número que no es finito deja la celda vacía', async () => {
    const libro = await leer(
      await buildWorkbook([hojaDe([{ cliente: 'Sin dato', total: Number.NaN, compras: 0, nota: null }])]),
    );

    expect(libro.getWorksheet('Por cliente')!.getRow(2).getCell(2).value).toBeNull();
  });
});

/**
 * Excel no acepta `: \ / ? * [ ]` en el nombre de una hoja y corta a 31 caracteres. Un
 * nombre inválido no falla al escribir: rompe el archivo al abrirlo, que es peor.
 */
describe('nombreDeHoja', () => {
  it('quita los caracteres que Excel no acepta', () => {
    expect(nombreDeHoja('Libro: compras/ventas [2026]')).toBe('Libro compras ventas 2026');
  });

  it('recorta a 31 caracteres', () => {
    expect(nombreDeHoja('Documentos emitidos del período completo').length).toBe(31);
  });

  it('un nombre que queda vacío cae en "Hoja"', () => {
    expect(nombreDeHoja('///')).toBe('Hoja');
  });
});
