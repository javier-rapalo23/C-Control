import { buildCsv, type CsvColumn } from '@/lib/csv';

/**
 * El CSV lo abre la contadora en Excel, así que lo que se fija acá es justo lo que
 * hace que el archivo se vea bien allá: el BOM, el fin de línea y las comillas.
 */

type Fila = { nombre: string; total: number; nota: string | null };

const COLUMNAS: CsvColumn<Fila>[] = [
  { header: 'Cliente', value: (row) => row.nombre },
  { header: 'Total', value: (row) => row.total },
  { header: 'Nota', value: (row) => row.nota },
];

const fila = (nombre: string, total = 100, nota: string | null = null): Fila => ({ nombre, total, nota });

describe('buildCsv', () => {
  it('escribe el encabezado y una línea por fila, terminadas en CRLF', () => {
    const csv = buildCsv(COLUMNAS, [fila('Juan Pérez', 1234.56)]);

    expect(csv).toBe('﻿Cliente,Total,Nota\r\nJuan Pérez,1234.56,\r\n');
  });

  // Sin BOM, Excel en Windows lee el archivo con la codificación del sistema y los
  // acentos salen rotos.
  it('empieza con BOM', () => {
    expect(buildCsv(COLUMNAS, [])).toMatch(/^﻿/);
  });

  it('cita el campo que trae coma, comilla o salto de línea', () => {
    const csv = buildCsv(COLUMNAS, [fila('Pérez, Juan'), fila('Finca "La Esperanza"'), fila('Dos\nlíneas')]);

    expect(csv).toContain('"Pérez, Juan"');
    expect(csv).toContain('"Finca ""La Esperanza"""');
    expect(csv).toContain('"Dos\nlíneas"');
  });

  // Excel ejecuta como fórmula un campo que empieza con `=`, `+`, `-` o `@`, y el
  // nombre del cliente lo escribe una persona.
  it('neutraliza el texto que Excel tomaría por fórmula', () => {
    const csv = buildCsv(COLUMNAS, [fila('=1+1'), fila('@usuario')]);

    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@usuario");
  });

  // Un monto negativo empieza con `-`, pero es número: protegerlo lo volvería texto y
  // Excel ya no podría sumar la columna.
  it('deja los números intactos, incluso negativos', () => {
    const csv = buildCsv(COLUMNAS, [{ nombre: 'Ajuste', total: -50.25, nota: null }]);

    expect(csv).toContain('Ajuste,-50.25,');
    expect(csv).not.toContain("'-50.25");
  });

  it('deja la celda vacía cuando el valor es nulo o no es un número finito', () => {
    const csv = buildCsv(COLUMNAS, [{ nombre: 'Sin nota', total: Number.NaN, nota: null }]);

    expect(csv).toContain('Sin nota,,\r\n');
  });
});
