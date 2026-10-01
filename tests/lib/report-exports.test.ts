import ExcelJS from 'exceljs';
import {
  caiStatusSheets,
  expenseReportSheets,
  fiscalBookSheets,
  fiscalPendingSheets,
  grindingReportSheets,
  purchaseReportSheets,
  saleReportSheets,
} from '@/lib/report-exports';
import { buildWorkbook } from '@/lib/xlsx';
import type {
  ExpenseReportDTO,
  FiscalBookReportDTO,
  FiscalCaiDTO,
  FiscalPendingReportDTO,
  GrindingReportDTO,
  PurchaseReportDTO,
  SaleReportDTO,
} from '@/types/domain';

/**
 * Qué hojas lleva el Excel de cada reporte. Se verifica sobre el archivo leído de vuelta,
 * porque lo que importa es lo que va a abrir la contadora.
 */

async function hojas(sheets: Parameters<typeof buildWorkbook>[0]) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await buildWorkbook(sheets)) as unknown as ArrayBuffer);
  return libro;
}

const RANGO = { from: '2026-09-01', to: '2026-09-30', groupBy: 'day' as const, sucursalId: 'suc-1' };

const COMPRAS: PurchaseReportDTO = {
  ...RANGO,
  totals: {
    totalLibras: 1137,
    totalQuintalesOro: 6.14,
    totalLempiras: 25_014,
    numeroCompras: 2,
    promedioPorLibra: 22,
  },
  periods: [
    { inicio: '2026-09-01', fin: '2026-09-01', label: '2026-09-01', totalLibras: 1137, totalQuintalesOro: 6.14, totalLempiras: 25_014, numeroCompras: 2 },
  ],
  porProducto: [
    { id: 'p1', nombre: 'Pergamino seco', totalLibras: 1137, totalQuintalesOro: 6.14, totalLempiras: 25_014, numeroCompras: 2 },
  ],
  porCliente: [
    { id: 'c1', nombre: 'Juan Pérez', totalLibras: 1137, totalQuintalesOro: 6.14, totalLempiras: 25_014, numeroCompras: 2 },
  ],
};

describe('purchaseReportSheets', () => {
  it('lleva totales primero y una hoja por tabla', async () => {
    const libro = await hojas(purchaseReportSheets(COMPRAS));

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Totales', 'Por día', 'Por producto', 'Por cliente']);
  });

  it('la hoja de período se llama como el agrupamiento elegido', async () => {
    const libro = await hojas(purchaseReportSheets({ ...COMPRAS, groupBy: 'week' }));

    expect(libro.worksheets.map((hoja) => hoja.name)).toContain('Por semana');
  });

  it('los totales salen como número y con su etiqueta', async () => {
    const libro = await hojas(purchaseReportSheets(COMPRAS));
    const totales = libro.getWorksheet('Totales')!;

    // Fila 1: la nota del período. Fila 2: vacía. Fila 3: el primer total.
    expect(String(totales.getRow(1).getCell(1).value)).toContain('2026-09-01');
    expect(totales.getRow(3).getCell(1).value).toBe('Total pagado');
    expect(totales.getRow(3).getCell(2).value).toBe(25_014);
  });
});

const VENTAS: SaleReportDTO = {
  ...RANGO,
  totals: {
    totalLibras: 1137,
    totalQuintalesOro: 6.14,
    totalLempiras: 25_014,
    numeroVentas: 1,
    promedioPorLibra: 22,
    promedioPorQuintalOro: 4_074.75,
  },
  periods: [
    { inicio: '2026-09-01', fin: '2026-09-01', label: '2026-09-01', totalLibras: 1137, totalQuintalesOro: 6.14, totalLempiras: 25_014, numeroVentas: 1 },
  ],
  porProducto: [],
  porCliente: [],
};

describe('saleReportSheets', () => {
  // El café se vende por quintal oro: ese promedio es el que se compara entre semanas.
  it('incluye el precio por quintal oro en los totales', async () => {
    const libro = await hojas(saleReportSheets(VENTAS));
    const etiquetas = (libro.getWorksheet('Totales')!.getColumn(1).values as unknown[]).map(String);

    expect(etiquetas).toContain('Precio promedio por quintal oro');
  });

  it('una tabla vacía sigue siendo una hoja, con su encabezado', async () => {
    const libro = await hojas(saleReportSheets(VENTAS));
    const porProducto = libro.getWorksheet('Por producto')!;

    // Nota, vacía y encabezado: tres filas, sin datos.
    expect(porProducto.rowCount).toBe(3);
    expect(porProducto.getRow(3).getCell(1).value).toBe('Producto');
  });
});

const MOLIDO: GrindingReportDTO = {
  ...RANGO,
  totals: { libras: 50, total: 150, numeroServicios: 1, promedioPorLibra: 3 },
  periods: [{ inicio: '2026-09-01', fin: '2026-09-01', label: '2026-09-01', libras: 50, total: 150, numeroServicios: 1 }],
  porCliente: [{ nombre: 'Juan Pérez', libras: 50, total: 150, numeroServicios: 1, porcentaje: 100 }],
};

const GASTOS: ExpenseReportDTO = {
  ...RANGO,
  totals: { total: 900, numeroGastos: 2 },
  periods: [{ inicio: '2026-09-01', fin: '2026-09-01', label: '2026-09-01', total: 900, numeroGastos: 2 }],
  porCategoria: [{ nombre: 'Combustible', total: 900, numeroGastos: 2, porcentaje: 100 }],
  porBanco: [],
};

describe('grindingReportSheets y expenseReportSheets', () => {
  it('el molido lleva libras además del dinero', async () => {
    const libro = await hojas(grindingReportSheets(MOLIDO));
    const encabezados = libro.getWorksheet('Por cliente')!.getRow(3).values as unknown[];

    expect(encabezados).toContain('Libras');
    expect(encabezados).toContain('Total');
  });

  // Una pestaña de bancos vacía haría dudar de si faltó algo.
  it('la hoja de bancos solo existe si hubo pagos a bancos', async () => {
    const sinBancos = await hojas(expenseReportSheets(GASTOS));
    expect(sinBancos.worksheets.map((hoja) => hoja.name)).not.toContain('Por banco');

    const conBancos = await hojas(
      expenseReportSheets({
        ...GASTOS,
        porBanco: [{ nombre: 'Banco Atlántida', total: 900, numeroGastos: 2, porcentaje: 100 }],
      }),
    );
    expect(conBancos.worksheets.map((hoja) => hoja.name)).toContain('Por banco');
  });
});

const LIBRO: FiscalBookReportDTO = {
  libro: 'ventas',
  from: '2026-09-01',
  to: '2026-09-30',
  rows: [
    {
      id: 'fd-1',
      numeroCompleto: '001-001-01-00000045',
      correlativo: 45,
      tipoDocumento: 'factura',
      tipoDocumentoLabel: 'Factura',
      caiCodigo: 'ABCD-1234',
      fechaEmision: '2026-09-10',
      businessDate: '2026-09-09',
      numeroInterno: 'V-000045',
      clienteNombre: 'Juan Pérez',
      clienteRtn: '0801-1990-123456',
      sucursalNombre: 'Bodega San Juan',
      origen: 'venta',
      importeExento: 3_000,
      importeExonerado: 0,
      importeGravado15: 0,
      importeGravado18: 0,
      isv15: 0,
      isv18: 0,
      total: 3_000,
      estado: 'emitido',
      anulado: false,
      anulacionMotivo: null,
      emitidoPor: 'usr-1',
      esNota: false,
      signo: 1,
      notaMotivo: null,
      documentoOrigenNumero: null,
    },
    {
      id: 'nc-1',
      numeroCompleto: '001-001-03-00000007',
      correlativo: 7,
      tipoDocumento: 'nota_credito',
      tipoDocumentoLabel: 'Nota de crédito',
      caiCodigo: 'NC-1234',
      fechaEmision: '2026-09-12',
      businessDate: '2026-09-12',
      numeroInterno: null,
      clienteNombre: 'Juan Pérez',
      clienteRtn: '0801-1990-123456',
      sucursalNombre: 'Bodega San Juan',
      origen: null,
      importeExento: -500,
      importeExonerado: 0,
      importeGravado15: 0,
      importeGravado18: 0,
      isv15: 0,
      isv18: 0,
      total: -500,
      estado: 'emitido',
      anulado: false,
      anulacionMotivo: null,
      emitidoPor: 'usr-1',
      esNota: true,
      signo: -1,
      notaMotivo: 'Café devuelto',
      documentoOrigenNumero: '001-001-01-00000045',
    },
    {
      id: 'fd-2',
      numeroCompleto: '001-001-01-00000046',
      correlativo: 46,
      tipoDocumento: 'factura',
      tipoDocumentoLabel: 'Factura',
      caiCodigo: 'ABCD-1234',
      fechaEmision: '2026-09-13',
      businessDate: '2026-09-13',
      numeroInterno: 'V-000046',
      clienteNombre: 'Otro cliente',
      clienteRtn: null,
      sucursalNombre: 'Bodega San Juan',
      origen: 'venta',
      importeExento: 800,
      importeExonerado: 0,
      importeGravado15: 0,
      importeGravado18: 0,
      isv15: 0,
      isv18: 0,
      total: 800,
      estado: 'anulado',
      anulado: true,
      anulacionMotivo: 'Cliente equivocado',
      emitidoPor: 'usr-1',
      esNota: false,
      signo: 1,
      notaMotivo: null,
      documentoOrigenNumero: null,
    },
  ],
  totals: {
    documentos: 3,
    anulados: 1,
    importeExento: 2_500,
    importeExonerado: 0,
    importeGravado15: 0,
    importeGravado18: 0,
    isv15: 0,
    isv18: 0,
    total: 2_500,
    totalAnulado: 800,
  },
  saltos: [],
};

describe('fiscalBookSheets', () => {
  it('lleva los totales del desglose y la hoja de documentos', async () => {
    const libro = await hojas(fiscalBookSheets(LIBRO));

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Totales', 'Documentos']);
    const etiquetas = (libro.getWorksheet('Totales')!.getColumn(1).values as unknown[]).map(String);
    for (const etiqueta of ['Importe exento', 'Importe exonerado', 'ISV 15 %', 'ISV 18 %', 'Total del libro']) {
      expect(etiquetas).toContain(etiqueta);
    }
  });

  // Una nota de crédito resta: en el Excel tiene que salir negativa y decir a qué
  // documento corresponde, o un renglón en rojo no se puede explicar.
  it('la nota de crédito sale negativa y con el documento que modifica', async () => {
    const libro = await hojas(fiscalBookSheets(LIBRO));
    const documentos = libro.getWorksheet('Documentos')!;
    const encabezados = (documentos.getRow(3).values as unknown[]).map(String);
    const columnaTotal = encabezados.indexOf('Total');
    const columnaModifica = encabezados.indexOf('Modifica');

    const nota = documentos.getRow(5);
    expect(nota.getCell(columnaTotal).value).toBe(-500);
    expect(nota.getCell(columnaModifica).value).toBe('001-001-01-00000045');
  });

  // Lo anulado va a su columna: si estuviera en la misma, arrastrar la suma en Excel
  // daría un total distinto al del reporte.
  it('el documento anulado suma cero y su monto va en la columna Anulado', async () => {
    const libro = await hojas(fiscalBookSheets(LIBRO));
    const documentos = libro.getWorksheet('Documentos')!;
    const encabezados = (documentos.getRow(3).values as unknown[]).map(String);

    const anulado = documentos.getRow(6);
    expect(anulado.getCell(encabezados.indexOf('Total')).value).toBe(0);
    expect(anulado.getCell(encabezados.indexOf('Anulado')).value).toBe(800);
    expect(anulado.getCell(encabezados.indexOf('Estado')).value).toBe('Anulado');
  });

  it('la hoja de números que faltan solo aparece si hay saltos', async () => {
    const conSaltos = await hojas(
      fiscalBookSheets({
        ...LIBRO,
        saltos: [{ caiCodigo: 'ABCD-1234', tipoDocumentoLabel: 'Factura', desde: 46, hasta: 47, cantidad: 2 }],
      }),
    );

    expect(conSaltos.worksheets.map((hoja) => hoja.name)).toContain('Números que faltan');
  });
});

const PENDIENTES: FiscalPendingReportDTO = {
  from: '2026-09-01',
  to: '2026-09-30',
  sucursalId: 'suc-1',
  rows: [
    {
      origen: 'compra',
      origenLabel: 'Compra',
      transactionId: 'pt-1',
      businessDate: '2026-09-25',
      numeroInterno: 'C-000123',
      clienteNombre: 'Juan Pérez',
      sucursalNombre: 'Bodega San Juan',
      total: 1_000,
      diasSinEmitir: 4,
    },
  ],
  totals: {
    documentos: 1,
    total: 1_000,
    porOrigen: [{ origen: 'compra', origenLabel: 'Compra', documentos: 1, total: 1_000 }],
  },
};

describe('fiscalPendingSheets y caiStatusSheets', () => {
  it('los pendientes desglosan el total por origen', async () => {
    const libro = await hojas(fiscalPendingSheets(PENDIENTES));
    const etiquetas = (libro.getWorksheet('Totales')!.getColumn(1).values as unknown[]).map(String);

    expect(etiquetas).toContain('Compra (1)');
    expect(libro.getWorksheet('Transacciones')!.getRow(4).getCell(6).value).toBe(1_000);
  });

  it('el estado del CAI exporta el rango y por qué no puede emitir', async () => {
    const cai = {
      id: 'cai-1',
      tipoDocumento: 'factura',
      tipoDocumentoLabel: 'Factura',
      codigo: 'ABCD-1234',
      codigoEstablecimiento: '001',
      codigoPuntoEmision: '001',
      codigoTipoDocumento: '01',
      rangoDesde: 1,
      rangoHasta: 500,
      fechaLimite: '2027-12-31',
      modo: 'SISTEMA',
      estado: 'activo',
      ultimoCorrelativo: 45,
      alertaPorcentaje: 80,
      alertaDiasPrevios: 30,
      notas: null,
      documentosEmitidos: 45,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      estadoRango: {
        total: 500,
        usados: 45,
        disponibles: 455,
        porcentajeUsado: 9,
        diasParaVencer: 458,
        vencido: false,
        agotado: false,
        alertaRango: false,
        alertaVencimiento: false,
        puedeEmitir: true,
        siguienteCorrelativo: 46,
        siguienteNumero: '001-001-01-00000046',
        motivoNoEmitible: null,
      },
    } satisfies FiscalCaiDTO;

    const libro = await hojas(caiStatusSheets([cai]));
    const hoja = libro.getWorksheet('Estado del CAI')!;
    const encabezados = (hoja.getRow(3).values as unknown[]).map(String);

    expect(hoja.getRow(4).getCell(encabezados.indexOf('Disponibles')).value).toBe(455);
    expect(hoja.getRow(4).getCell(encabezados.indexOf('Siguiente número')).value).toBe('001-001-01-00000046');
    // Sin impedimento, la columna dice "Sí" en vez de quedar vacía.
    expect(hoja.getRow(4).getCell(encabezados.indexOf('Puede emitir')).value).toBe('Sí');
  });
});
