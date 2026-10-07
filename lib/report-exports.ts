import { formatBusinessRange } from '@/lib/business-date';
import { sheet, type Sheet, type TotalesSheet } from '@/lib/xlsx';
import type {
  ExpenseReportDTO,
  ExpenseReportGroupDTO,
  ExpenseReportPeriodDTO,
  FiscalBookReportDTO,
  FiscalBookRowDTO,
  FiscalCaiDTO,
  FiscalPendingReportDTO,
  FiscalPendingRowDTO,
  GrindingReportDTO,
  GrindingReportGroupDTO,
  GrindingReportPeriodDTO,
  PurchaseReportBreakdownDTO,
  PurchaseReportClienteProductoDTO,
  PurchaseReportDTO,
  PurchaseReportPeriodDTO,
  SaleReportBreakdownDTO,
  SaleReportDTO,
  SaleReportPeriodDTO,
} from '@/types/domain';

/**
 * Qué hojas lleva el Excel de cada reporte.
 *
 * Son funciones puras sobre el DTO que ya devuelve la API: el reporte se calcula una sola
 * vez y de ahí salen la pantalla y el archivo. Si se calculara aparte para exportar, el
 * Excel podría no coincidir con lo que se está viendo, que es el peor defecto posible en
 * algo que se manda a la contadora.
 *
 * Dos criterios en todas:
 *
 * 1. **Primero la hoja de totales.** Es lo que se mira al abrir el archivo.
 * 2. **Las fechas van como texto ISO** (`2026-09-28`) y no como fecha de Excel. Las fechas
 *    de negocio son del huso de Honduras; convertirlas a fecha de Excel las expone a que
 *    el huso de la máquina las corra un día, y en texto ISO ordenan igual de bien.
 */

const periodo = (from: string, to: string) => `Período ${formatBusinessRange(from, to)} (${from} a ${to})`;

/** Las columnas de un período, iguales en los cuatro reportes de negocio. */
const columnaPeriodo = <T extends { label: string; inicio: string; fin: string }>(): Sheet<T>['columns'] => [
  { header: 'Período', value: (row) => row.label, width: 22 },
  { header: 'Desde', value: (row) => row.inicio },
  { header: 'Hasta', value: (row) => row.fin },
];

export function purchaseReportSheets(report: PurchaseReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = periodo(report.from, report.to);

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Total pagado', valor: report.totals.totalLempiras, formato: 'moneda' },
      { etiqueta: 'Libras compradas', valor: report.totals.totalLibras, formato: 'numero' },
      { etiqueta: 'Quintales oro', valor: report.totals.totalQuintalesOro, formato: 'numero' },
      { etiqueta: 'Precio promedio por libra', valor: report.totals.promedioPorLibra, formato: 'numero' },
      { etiqueta: 'Número de compras', valor: report.totals.numeroCompras, formato: 'entero' },
    ],
  };

  const porPeriodo = sheet<PurchaseReportPeriodDTO>({
    nombre: report.groupBy === 'week' ? 'Por semana' : 'Por día',
    nota,
    columns: [
      ...columnaPeriodo<PurchaseReportPeriodDTO>(),
      { header: 'Libras', value: (row) => row.totalLibras, formato: 'numero' },
      { header: 'QQ oro', value: (row) => row.totalQuintalesOro, formato: 'numero' },
      { header: 'Total', value: (row) => row.totalLempiras, formato: 'moneda' },
      { header: 'Compras', value: (row) => row.numeroCompras, formato: 'entero' },
    ],
    rows: report.periods,
  });

  const desglose = (nombre: string, etiqueta: string, rows: PurchaseReportBreakdownDTO[]) =>
    sheet<PurchaseReportBreakdownDTO>({
      nombre,
      nota,
      columns: [
        { header: etiqueta, value: (row) => row.nombre, width: 30 },
        { header: 'Libras', value: (row) => row.totalLibras, formato: 'numero' },
        { header: 'QQ oro', value: (row) => row.totalQuintalesOro, formato: 'numero' },
        { header: 'Total', value: (row) => row.totalLempiras, formato: 'moneda' },
        { header: 'Compras', value: (row) => row.numeroCompras, formato: 'entero' },
      ],
      rows,
    });

  // Una fila por cliente y café, con el cliente repetido: así se puede filtrar y hacer
  // tablas dinámicas en Excel sin rellenar celdas a mano.
  const porClienteProducto = sheet<PurchaseReportClienteProductoDTO>({
    nombre: 'Cliente y tipo de café',
    nota,
    columns: [
      { header: 'Cliente', value: (row) => row.clienteNombre, width: 30 },
      { header: 'Tipo de café', value: (row) => row.productoNombre, width: 24 },
      { header: 'Libras', value: (row) => row.totalLibras, formato: 'numero' },
      { header: 'QQ oro', value: (row) => row.totalQuintalesOro, formato: 'numero' },
      { header: 'Total', value: (row) => row.totalLempiras, formato: 'moneda' },
      { header: 'Compras', value: (row) => row.numeroCompras, formato: 'entero' },
    ],
    rows: report.porClienteProducto ?? [],
  });

  return [
    totales,
    porPeriodo,
    desglose('Por producto', 'Producto', report.porProducto),
    desglose('Por cliente', 'Cliente', report.porCliente),
    porClienteProducto,
  ];
}

export function saleReportSheets(report: SaleReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = periodo(report.from, report.to);

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Total vendido', valor: report.totals.totalLempiras, formato: 'moneda' },
      { etiqueta: 'Libras vendidas', valor: report.totals.totalLibras, formato: 'numero' },
      { etiqueta: 'Quintales oro', valor: report.totals.totalQuintalesOro, formato: 'numero' },
      { etiqueta: 'Precio promedio por libra', valor: report.totals.promedioPorLibra, formato: 'numero' },
      // El café se vende por quintal oro: es el precio que se compara entre semanas.
      { etiqueta: 'Precio promedio por quintal oro', valor: report.totals.promedioPorQuintalOro, formato: 'numero' },
      { etiqueta: 'Número de ventas', valor: report.totals.numeroVentas, formato: 'entero' },
    ],
  };

  const porPeriodo = sheet<SaleReportPeriodDTO>({
    nombre: report.groupBy === 'week' ? 'Por semana' : 'Por día',
    nota,
    columns: [
      ...columnaPeriodo<SaleReportPeriodDTO>(),
      { header: 'Libras', value: (row) => row.totalLibras, formato: 'numero' },
      { header: 'QQ oro', value: (row) => row.totalQuintalesOro, formato: 'numero' },
      { header: 'Total', value: (row) => row.totalLempiras, formato: 'moneda' },
      { header: 'Ventas', value: (row) => row.numeroVentas, formato: 'entero' },
    ],
    rows: report.periods,
  });

  const desglose = (nombre: string, etiqueta: string, rows: SaleReportBreakdownDTO[]) =>
    sheet<SaleReportBreakdownDTO>({
      nombre,
      nota,
      columns: [
        { header: etiqueta, value: (row) => row.nombre, width: 30 },
        { header: 'Libras', value: (row) => row.totalLibras, formato: 'numero' },
        { header: 'QQ oro', value: (row) => row.totalQuintalesOro, formato: 'numero' },
        { header: 'Total', value: (row) => row.totalLempiras, formato: 'moneda' },
        { header: 'Ventas', value: (row) => row.numeroVentas, formato: 'entero' },
      ],
      rows,
    });

  return [
    totales,
    porPeriodo,
    desglose('Por producto', 'Producto', report.porProducto),
    desglose('Por cliente', 'Cliente', report.porCliente),
  ];
}

export function grindingReportSheets(report: GrindingReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = periodo(report.from, report.to);

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Total cobrado', valor: report.totals.total, formato: 'moneda' },
      { etiqueta: 'Libras molidas', valor: report.totals.libras, formato: 'numero' },
      { etiqueta: 'Cobrado por libra', valor: report.totals.promedioPorLibra, formato: 'numero' },
      { etiqueta: 'Número de servicios', valor: report.totals.numeroServicios, formato: 'entero' },
    ],
  };

  const porPeriodo = sheet<GrindingReportPeriodDTO>({
    nombre: report.groupBy === 'week' ? 'Por semana' : 'Por día',
    nota,
    columns: [
      ...columnaPeriodo<GrindingReportPeriodDTO>(),
      { header: 'Libras', value: (row) => row.libras, formato: 'numero' },
      { header: 'Total', value: (row) => row.total, formato: 'moneda' },
      { header: 'Servicios', value: (row) => row.numeroServicios, formato: 'entero' },
    ],
    rows: report.periods,
  });

  const porCliente = sheet<GrindingReportGroupDTO>({
    nombre: 'Por cliente',
    nota,
    columns: [
      { header: 'Cliente', value: (row) => row.nombre, width: 30 },
      { header: 'Libras', value: (row) => row.libras, formato: 'numero' },
      { header: 'Total', value: (row) => row.total, formato: 'moneda' },
      { header: '% del total', value: (row) => row.porcentaje, formato: 'porcentaje' },
      { header: 'Servicios', value: (row) => row.numeroServicios, formato: 'entero' },
    ],
    rows: report.porCliente,
  });

  return [totales, porPeriodo, porCliente];
}

export function expenseReportSheets(report: ExpenseReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = periodo(report.from, report.to);

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Total gastado', valor: report.totals.total, formato: 'moneda' },
      { etiqueta: 'Número de gastos', valor: report.totals.numeroGastos, formato: 'entero' },
    ],
  };

  const porPeriodo = sheet<ExpenseReportPeriodDTO>({
    nombre: report.groupBy === 'week' ? 'Por semana' : 'Por día',
    nota,
    columns: [
      ...columnaPeriodo<ExpenseReportPeriodDTO>(),
      { header: 'Total', value: (row) => row.total, formato: 'moneda' },
      { header: 'Gastos', value: (row) => row.numeroGastos, formato: 'entero' },
    ],
    rows: report.periods,
  });

  const grupo = (nombre: string, etiqueta: string, rows: ExpenseReportGroupDTO[]) =>
    sheet<ExpenseReportGroupDTO>({
      nombre,
      nota,
      columns: [
        { header: etiqueta, value: (row) => row.nombre, width: 30 },
        { header: 'Total', value: (row) => row.total, formato: 'moneda' },
        { header: '% del total', value: (row) => row.porcentaje, formato: 'porcentaje' },
        { header: 'Gastos', value: (row) => row.numeroGastos, formato: 'entero' },
      ],
      rows,
    });

  const hojas: Array<Sheet<never> | TotalesSheet> = [
    totales,
    porPeriodo,
    grupo('Por categoría', 'Categoría', report.porCategoria),
  ];

  // La hoja de bancos solo existe si hubo pagos a bancos: una pestaña vacía hace dudar de
  // si faltó algo.
  if (report.porBanco.length > 0) {
    hojas.push(grupo('Por banco', 'Banco', report.porBanco));
  }

  return hojas;
}

export function fiscalBookSheets(report: FiscalBookReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = `Libro de ${report.libro} · ${periodo(report.from, report.to)} · por fecha de emisión`;

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Documentos', valor: report.totals.documentos, formato: 'entero' },
      { etiqueta: 'Anulados (no suman)', valor: report.totals.anulados, formato: 'entero' },
      { etiqueta: 'Importe exento', valor: report.totals.importeExento, formato: 'moneda' },
      { etiqueta: 'Importe exonerado', valor: report.totals.importeExonerado, formato: 'moneda' },
      { etiqueta: 'Importe gravado 15 %', valor: report.totals.importeGravado15, formato: 'moneda' },
      { etiqueta: 'ISV 15 %', valor: report.totals.isv15, formato: 'moneda' },
      { etiqueta: 'Importe gravado 18 %', valor: report.totals.importeGravado18, formato: 'moneda' },
      { etiqueta: 'ISV 18 %', valor: report.totals.isv18, formato: 'moneda' },
      { etiqueta: 'Total del libro', valor: report.totals.total, formato: 'moneda' },
      { etiqueta: 'Monto anulado', valor: report.totals.totalAnulado, formato: 'moneda' },
    ],
  };

  // Los importes de un documento anulado van a una columna propia, igual que en el CSV:
  // si estuvieran en la misma, arrastrar la suma en Excel daría otro total.
  const documentos = sheet<FiscalBookRowDTO>({
    nombre: 'Documentos',
    nota,
    columns: [
      { header: 'Fecha emisión', value: (row) => row.fechaEmision },
      { header: 'Número', value: (row) => row.numeroCompleto, width: 22 },
      { header: 'Tipo', value: (row) => row.tipoDocumentoLabel, width: 18 },
      { header: 'CAI', value: (row) => row.caiCodigo, width: 24 },
      { header: 'Estado', value: (row) => (row.anulado ? 'Anulado' : 'Emitido') },
      { header: 'Modifica', value: (row) => row.documentoOrigenNumero, width: 22 },
      { header: 'Motivo de la nota', value: (row) => row.notaMotivo, width: 30 },
      { header: 'Fecha operación', value: (row) => row.businessDate },
      { header: 'Control interno', value: (row) => row.numeroInterno },
      { header: 'Cliente', value: (row) => row.clienteNombre, width: 30 },
      { header: 'RTN', value: (row) => row.clienteRtn, width: 18 },
      { header: 'Sucursal', value: (row) => row.sucursalNombre, width: 20 },
      { header: 'Exento', value: (row) => (row.anulado ? 0 : row.importeExento), formato: 'moneda' },
      { header: 'Exonerado', value: (row) => (row.anulado ? 0 : row.importeExonerado), formato: 'moneda' },
      { header: 'Gravado 15%', value: (row) => (row.anulado ? 0 : row.importeGravado15), formato: 'moneda' },
      { header: 'ISV 15%', value: (row) => (row.anulado ? 0 : row.isv15), formato: 'moneda' },
      { header: 'Gravado 18%', value: (row) => (row.anulado ? 0 : row.importeGravado18), formato: 'moneda' },
      { header: 'ISV 18%', value: (row) => (row.anulado ? 0 : row.isv18), formato: 'moneda' },
      { header: 'Total', value: (row) => (row.anulado ? 0 : row.total), formato: 'moneda' },
      { header: 'Anulado', value: (row) => (row.anulado ? row.total : 0), formato: 'moneda' },
      { header: 'Motivo anulación', value: (row) => row.anulacionMotivo, width: 30 },
      { header: 'Emitido por', value: (row) => row.emitidoPor },
    ],
    rows: report.rows,
  });

  const hojas: Array<Sheet<never> | TotalesSheet> = [totales, documentos];

  // Los saltos solo se exportan si existen: es lo que hay que poder explicar en una
  // revisión, y una pestaña vacía sugeriría que falta algo.
  if (report.saltos.length > 0) {
    hojas.push(
      sheet<FiscalBookReportDTO['saltos'][number]>({
        nombre: 'Números que faltan',
        nota: 'Números del rango que no aparecen entre el primero y el último del período.',
        columns: [
          { header: 'CAI', value: (row) => row.caiCodigo, width: 24 },
          { header: 'Tipo', value: (row) => row.tipoDocumentoLabel, width: 18 },
          { header: 'Desde', value: (row) => row.desde, formato: 'entero' },
          { header: 'Hasta', value: (row) => row.hasta, formato: 'entero' },
          { header: 'Cantidad', value: (row) => row.cantidad, formato: 'entero' },
        ],
        rows: report.saltos,
      }),
    );
  }

  return hojas;
}

export function fiscalPendingSheets(report: FiscalPendingReportDTO): Array<Sheet<never> | TotalesSheet> {
  const nota = `Pendientes de emitir · ${periodo(report.from, report.to)}`;

  const totales: TotalesSheet = {
    nombre: 'Totales',
    nota,
    filas: [
      { etiqueta: 'Sin documento', valor: report.totals.documentos, formato: 'entero' },
      { etiqueta: 'Monto sin documentar', valor: report.totals.total, formato: 'moneda' },
      ...report.totals.porOrigen.map((grupo) => ({
        etiqueta: `${grupo.origenLabel} (${grupo.documentos})`,
        valor: grupo.total,
        formato: 'moneda' as const,
      })),
    ],
  };

  const transacciones = sheet<FiscalPendingRowDTO>({
    nombre: 'Transacciones',
    nota,
    columns: [
      { header: 'Fecha', value: (row) => row.businessDate },
      { header: 'Origen', value: (row) => row.origenLabel },
      { header: 'Control interno', value: (row) => row.numeroInterno },
      { header: 'Cliente', value: (row) => row.clienteNombre, width: 30 },
      { header: 'Sucursal', value: (row) => row.sucursalNombre, width: 20 },
      { header: 'Total', value: (row) => row.total, formato: 'moneda' },
      { header: 'Días sin emitir', value: (row) => row.diasSinEmitir, formato: 'entero' },
    ],
    rows: report.rows,
  });

  return [totales, transacciones];
}

export function caiStatusSheets(cais: FiscalCaiDTO[]): Array<Sheet<never> | TotalesSheet> {
  return [
    sheet<FiscalCaiDTO>({
      nombre: 'Estado del CAI',
      nota: 'Rango autorizado y lo que queda de él. Se recalcula en cada consulta.',
      columns: [
        { header: 'Tipo', value: (row) => row.tipoDocumentoLabel, width: 18 },
        { header: 'CAI', value: (row) => row.codigo, width: 24 },
        { header: 'Estado', value: (row) => row.estado },
        { header: 'Modo', value: (row) => row.modo },
        { header: 'Desde', value: (row) => row.rangoDesde, formato: 'entero' },
        { header: 'Hasta', value: (row) => row.rangoHasta, formato: 'entero' },
        { header: 'Usados', value: (row) => row.estadoRango.usados, formato: 'entero' },
        { header: 'Disponibles', value: (row) => row.estadoRango.disponibles, formato: 'entero' },
        { header: '% usado', value: (row) => row.estadoRango.porcentajeUsado, formato: 'porcentaje' },
        { header: 'Siguiente número', value: (row) => row.estadoRango.siguienteNumero, width: 22 },
        { header: 'Fecha límite', value: (row) => row.fechaLimite },
        { header: 'Días para vencer', value: (row) => row.estadoRango.diasParaVencer, formato: 'entero' },
        {
          header: 'Puede emitir',
          value: (row) => row.estadoRango.motivoNoEmitible ?? 'Sí',
          width: 34,
        },
      ],
      rows: cais,
    }),
  ];
}
