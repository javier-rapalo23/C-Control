export type SucursalDTO = {
  id: string;
  nombre: string;
  direccion?: string | null;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

import type { ProductoCategoria } from '@/lib/coffee-types';

export type { ProductoCategoria };

/**
 * Sin precio ni factor de conversión a oro: los dos se capturan por línea, no en
 * el catálogo. Ver `lib/coffee-types.ts` y `lib/oro.ts`.
 */
export type ProductoDTO = {
  id: string;
  nombre: string;
  categoria?: ProductoCategoria | null;
  taraPorSaco?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientDTO = {
  id: string;
  nombre: string;
  nombres?: string | null;
  apellidos?: string | null;
  claveIhcafe?: string | null;
  nombreFinca?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  rtn?: string | null;
  cuentaBancaria?: string | null;
  notas?: string | null;
  esGeneral: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClienteOriginalDTO = {
  id: string;
  clientId: string;
  nombres: string;
  apellidos: string;
  claveIhcafe: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  productoId: string;
  productoNombre: string;
  precioPorLibra: number;
  pesoBruto?: number | null;
  numeroSacos?: number | null;
  taraPorSaco?: number | null;
  /** Rendimiento del lote en porcentaje (54 = 54 %), capturado por línea. */
  porcentajeOro?: number | null;
  quintalesOro?: number | null;
  libras: number;
  total: number;
  purchaseTransactionId: string;
  createdAt: string;
};

export type PurchaseTransactionItemDTO = PurchaseDTO;

export type PurchaseTransactionDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  clientId: string;
  /** Valor del catálogo de `lib/payment-methods.ts`; solo "efectivo" resta de caja. */
  metodoPago: string;
  /** Número del talonario físico, capturado a mano. Nulo si aún no se facturó. */
  numeroFactura: string | null;
  /** Correlativo interno ya formateado (`C-000123`). Lo asigna la base. */
  numeroInterno: string;
  /** Suma de las líneas: el café por su cuenta, sin ajustes. */
  subtotal: number;
  /** Ajustes al pie: el bono suma y el descuento resta. Cero si no hubo. */
  bono: number;
  bonoMotivo: string | null;
  descuento: number;
  descuentoMotivo: string | null;
  /** Lo que se le paga al productor: `subtotal + bono − descuento`. */
  total: number;
  /** Fecha de caja en que se pagó una compra pendiente; nulo si sigue pendiente. */
  pagoFecha: string | null;
  pagoMetodo: string | null;
  createdAt: string;
  updatedAt: string;
  client: ClientDTO;
  items: PurchaseTransactionItemDTO[];
};

/** Compra con pago pendiente, tal como se lista en Caja. */
export type PendingPaymentDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  clientNombre: string;
  numeroFactura: string | null;
  total: number;
  itemsCount: number;
  pagoFecha: string | null;
  pagoMetodo: string | null;
};

export type SaleDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  productoId?: string | null;
  productoNombre?: string | null;
  precioPorLibra?: number | null;
  pesoBruto?: number | null;
  numeroSacos?: number | null;
  taraPorSaco?: number | null;
  libras?: number | null;
  porcentajeOro?: number | null;
  quintalesOro?: number | null;
  precioPorQuintalOro?: number | null;
  descripcion?: string | null;
  monto: number;
  saleTransactionId: string;
  createdAt: string;
};

export type SaleTransactionItemDTO = SaleDTO;

export type SaleTransactionDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  clientId: string;
  /** Correlativo interno ya formateado (`V-000123`). Lo asigna la base. */
  numeroInterno: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  client: ClientDTO;
  items: SaleTransactionItemDTO[];
};

export type BancoDTO = {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  categoria: string;
  /** Solo en los gastos de "Pago banco"; nulo en el resto. */
  bancoId: string | null;
  /** Denormalizado para listar el gasto sin volver a consultar el catálogo. */
  bancoNombre: string | null;
  descripcion: string;
  monto: number;
  createdAt: string;
};

export type CashEntryDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  descripcion: string;
  monto: number;
  registradoPor: string;
  createdAt: string;
};

export type GrindingServiceDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  clientId: string;
  clientNombre: string;
  libras: number;
  monto: number;
  notas: string | null;
  registradoPor: string;
  createdAt: string;
  updatedAt: string;
};

/** Misma forma que `CashEntryDTO`; lo que cambia es el signo con el que entra al saldo. */
export type CashWithdrawalDTO = CashEntryDTO;

export type CashTransferDTO = {
  id: string;
  businessDate: string;
  sucursalOrigenId: string;
  /** Denormalizados para mostrar "Enviado a X" sin volver a consultar sucursales. */
  sucursalOrigenNombre: string;
  sucursalDestinoId: string;
  sucursalDestinoNombre: string;
  descripcion: string | null;
  monto: number;
  registradoPor: string;
  createdAt: string;
};

export type DailyBalanceDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  saldoInicial: number;
  saldoActual: number;
  /** Diferencia del arqueo (contado − esperado); 0 mientras la caja no se cierre. */
  ajusteCaja: number;
  createdAt: string;
  updatedAt: string;
};

export type CompanySettingsDTO = {
  id: string;
  nombre: string;
  rtn: string;
  telefono: string;
  direccion: string;
  email: string;
  printerIp: string;
  printerPort: number;
  /** Vacío mientras se facture con talonario físico; con valor activa el bloque fiscal de la factura A4. */
  cai: string;
  facturaRangoDesde: string;
  facturaRangoHasta: string;
  facturaFechaLimite: string;
  /** `a4` o `termico80`: con qué formato se imprime la factura por omisión. */
  formatoImpresionDefault: string;
  updatedAt: string;
};

export type FiscalCaiDTO = {
  id: string;
  tipoDocumento: string;
  /** Etiqueta del catálogo de `lib/fiscal.ts`, para no repetirla en el cliente. */
  tipoDocumentoLabel: string;
  codigo: string;
  codigoEstablecimiento: string;
  codigoPuntoEmision: string;
  codigoTipoDocumento: string;
  rangoDesde: number;
  rangoHasta: number;
  fechaLimite: string;
  modo: string;
  estado: string;
  ultimoCorrelativo: number;
  alertaPorcentaje: number;
  alertaDiasPrevios: number;
  notas: string | null;
  /** Cuántos documentos se emitieron con este CAI: si hay alguno, la numeración se congela. */
  documentosEmitidos: number;
  createdAt: string;
  updatedAt: string;
  /** Derivado, nunca guardado: se recalcula en cada lectura (`evaluarCai`). */
  estadoRango: {
    total: number;
    usados: number;
    disponibles: number;
    porcentajeUsado: number;
    diasParaVencer: number;
    vencido: boolean;
    agotado: boolean;
    alertaRango: boolean;
    alertaVencimiento: boolean;
    puedeEmitir: boolean;
    siguienteCorrelativo: number | null;
    /** Cómo se vería el próximo número, para revisar los códigos antes de emitir. */
    siguienteNumero: string | null;
    motivoNoEmitible: string | null;
  };
};

/**
 * Una nota que modifica un documento, vista desde el documento modificado. Lleva el
 * monto en positivo, como se imprime; el signo lo pone el libro.
 */
export type FiscalNotaResumenDTO = {
  id: string;
  tipoDocumento: string;
  tipoDocumentoLabel: string;
  numeroCompleto: string;
  estado: string;
  total: number;
  notaMotivo: string | null;
  fechaEmision: string;
};

export type FiscalDocumentDTO = {
  id: string;
  caiId: string;
  caiCodigo: string | null;
  tipoDocumento: string;
  tipoDocumentoLabel: string;
  correlativo: number;
  /** `EEE-PPP-TT-CCCCCCCC`. */
  numeroCompleto: string;
  estado: string;
  /** Fecha de negocio de la transacción amparada. */
  businessDate: string;
  emitidoEn: string;
  /** Fecha de negocio de la emisión; es la que decide el plazo de anulación. */
  fechaEmision: string;
  emitidoPor: string;
  purchaseTransactionId: string | null;
  saleTransactionId: string | null;
  grindingServiceId: string | null;
  total: number;
  moneda: string;
  desglose: {
    importeExento: number;
    importeExonerado: number;
    importeGravado15: number;
    importeGravado18: number;
    isv15: number;
    isv18: number;
  };
  formatoVersion: string;
  anuladoEn: string | null;
  anuladoPor: string | null;
  anulacionMotivo: string | null;
  copiaFisicaResguardada: boolean;
  copiaFisicaUbicacion: string | null;
  /** Derivado: solo se puede anular el mismo día de la emisión. */
  anulable: boolean;
  /** `true` en notas de crédito y débito: modifican un documento, no una transacción. */
  esNota: boolean;
  /** Por qué se emitió la nota. Null en facturas y boletas. */
  notaMotivo: string | null;
  /** El documento que esta nota modifica. Null si no es nota. */
  documentoOrigen: {
    id: string;
    numeroCompleto: string;
    tipoDocumento: string;
    tipoDocumentoLabel: string;
    fechaEmision: string;
  } | null;
  /** Las notas emitidas sobre este documento, de la más nueva a la más vieja. */
  notas: FiscalNotaResumenDTO[];
  /**
   * Cuánto queda por acreditar: el total del documento, más las notas de débito
   * emitidas, menos las de crédito. Es el techo de la próxima nota de crédito, para que
   * no se pueda devolver más de lo que se facturó. 0 en una nota.
   */
  saldoAcreditable: number;
};

export type ModuleAccessDTO = {
  moduleKey: string;
  label: string;
  roles: string[];
  locked: boolean;
};

export type UserDTO = {
  id: string;
  userId: string;
  nombre: string;
  role: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductoCargaDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  productoId: string;
  productoNombre: string;
  libras: number | null;
  descripcion: string | null;
  createdAt: string;
};

export type ProductoStockDTO = {
  productoId: string;
  totalLibras: number;
  daily: { businessDate: string; libras: number }[];
  purchases: PurchaseDTO[];
  sales: SaleDTO[];
};

export type EmployeeDTO = {
  id: string;
  sucursalId: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  salarioDiario: number | null;
  fechaIngreso: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeePaymentDTO = {
  id: string;
  businessDate: string;
  employeeId: string;
  employeeNombre: string;
  concepto: string;
  monto: number;
  createdAt: string;
};

export type AttendanceDTO = {
  id: string;
  businessDate: string;
  employeeId: string;
  employeeNombre: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeAdvanceDTO = {
  id: string;
  businessDate: string;
  employeeId: string;
  employeeNombre: string;
  monto: number;
  motivo: string | null;
  createdAt: string;
};

export type LedgerDTO = {
  businessDate: string;
  sucursalId: string;
  balance: DailyBalanceDTO;
  totals: {
    /** Todas las compras del día, sin importar cómo se pagaron. */
    totalCompras: number;
    /** La parte de `totalCompras` pagada en efectivo: la única que resta del saldo. */
    totalComprasEfectivo: number;
    totalComprasDeposito: number;
    totalComprasCheque: number;
    /** Compras del día registradas como "Pendiente de pago", se hayan pagado ya o no. */
    totalComprasPendientes: number;
    /** Compras pagadas con depósito o cheque, que no tocan la caja. */
    totalComprasOtrosMedios: number;
    totalVentas: number;
    totalGastos: number;
    totalIngresos: number;
    /** Cobros del servicio de molido. Suma al saldo. */
    totalMolido: number;
    /** Compras pendientes de otros días pagadas hoy en efectivo. Resta del saldo. */
    totalPagosPendientes: number;
    /** Efectivo retirado de la caja sin ser compra ni gasto. Resta del saldo. */
    totalSalidas: number;
    /** Efectivo recibido de otras bodegas. Suma al saldo. */
    totalTrasladosRecibidos: number;
    /** Efectivo enviado a otras bodegas. Resta del saldo. */
    totalTrasladosEnviados: number;
    ajusteCaja: number;
    saldoActual: number;
  };
  purchases: PurchaseDTO[];
  sales: SaleDTO[];
  expenses: ExpenseDTO[];
  cashEntries: CashEntryDTO[];
  cashWithdrawals: CashWithdrawalDTO[];
  /** Traslados donde esta bodega es origen o destino. */
  cashTransfers: CashTransferDTO[];
};

export type CashSessionDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  estado: 'abierta' | 'cerrada';
  montoApertura: number;
  abiertaPor: string;
  abiertaAt: string;
  montoContado: number | null;
  saldoEsperado: number | null;
  diferencia: number | null;
  cerradaPor: string | null;
  cerradaAt: string | null;
  notas: string | null;
};

export type PurchaseReportPeriodDTO = {
  inicio: string;
  fin: string;
  label: string;
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroCompras: number;
};

export type PurchaseReportBreakdownDTO = {
  id: string;
  nombre: string;
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroCompras: number;
};

export type PurchaseReportDTO = {
  from: string;
  to: string;
  groupBy: 'day' | 'week';
  sucursalId: string | null;
  totals: {
    totalLibras: number;
    totalQuintalesOro: number;
    totalLempiras: number;
    numeroCompras: number;
    promedioPorLibra: number;
  };
  periods: PurchaseReportPeriodDTO[];
  porProducto: PurchaseReportBreakdownDTO[];
  porCliente: PurchaseReportBreakdownDTO[];
};

export type SaleReportPeriodDTO = {
  inicio: string;
  fin: string;
  label: string;
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroVentas: number;
};

export type SaleReportBreakdownDTO = {
  id: string;
  nombre: string;
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroVentas: number;
};

export type SaleReportDTO = {
  from: string;
  to: string;
  groupBy: 'day' | 'week';
  sucursalId: string | null;
  totals: {
    totalLibras: number;
    totalQuintalesOro: number;
    totalLempiras: number;
    numeroVentas: number;
    promedioPorLibra: number;
    /** Precio real por quintal oro del período; 0 si no se vendió en oro. */
    promedioPorQuintalOro: number;
  };
  periods: SaleReportPeriodDTO[];
  porProducto: SaleReportBreakdownDTO[];
  porCliente: SaleReportBreakdownDTO[];
};

export type ExpenseReportGroupDTO = {
  /** Categoría del catálogo, o nombre del banco en el desglose por banco. */
  nombre: string;
  total: number;
  numeroGastos: number;
  /** Porcentaje del total del período; ya redondeado. */
  porcentaje: number;
};

export type ExpenseReportPeriodDTO = {
  inicio: string;
  fin: string;
  label: string;
  total: number;
  numeroGastos: number;
};

export type ExpenseReportDTO = {
  from: string;
  to: string;
  groupBy: 'day' | 'week';
  sucursalId: string | null;
  totals: {
    total: number;
    numeroGastos: number;
  };
  periods: ExpenseReportPeriodDTO[];
  porCategoria: ExpenseReportGroupDTO[];
  /** Desglose de la categoría "Pago banco"; vacío si no hubo pagos a bancos. */
  porBanco: ExpenseReportGroupDTO[];
};

export type GrindingReportGroupDTO = {
  /** Nombre del cliente. */
  nombre: string;
  libras: number;
  total: number;
  numeroServicios: number;
  /** Porcentaje del total del período; ya redondeado. */
  porcentaje: number;
};

export type GrindingReportPeriodDTO = {
  inicio: string;
  fin: string;
  label: string;
  libras: number;
  total: number;
  numeroServicios: number;
};

export type GrindingReportDTO = {
  from: string;
  to: string;
  groupBy: 'day' | 'week';
  sucursalId: string | null;
  totals: {
    libras: number;
    total: number;
    numeroServicios: number;
    /** Lo cobrado por libra en el período. 0 si no se molió nada. */
    promedioPorLibra: number;
  };
  periods: GrindingReportPeriodDTO[];
  porCliente: GrindingReportGroupDTO[];
};

export type PayrollLineDTO = {
  employeeId: string;
  employeeNombre: string;
  salarioDiario: number | null;
  diasTrabajados: number;
  subtotal: number;
  adelantosPendientes: number;
  adelantosAplicados: number;
  neto: number;
  /** Adelanto que no cupo en el pago de esta semana y queda para la siguiente. */
  adelantoRemanente: number;
  yaPagado: boolean;
  advertencia: string | null;
};

export type PayrollPreviewDTO = {
  from: string;
  to: string;
  label: string;
  sucursalId: string;
  lines: PayrollLineDTO[];
  totals: {
    subtotal: number;
    adelantosAplicados: number;
    neto: number;
    empleados: number;
  };
};

/**
 * Un renglón del libro de compras o de ventas: **un documento fiscal**, con los datos
 * como quedaron al emitirlo. El nombre del cliente, su RTN y el correlativo interno
 * salen del `snapshot`, no de los registros vivos: el libro tiene que decir lo que
 * dice el papel que se entregó, aunque después le hayan corregido el RTN al cliente.
 *
 * Los importes vienen **con el signo del libro ya aplicado**: los de una nota de crédito
 * son negativos, porque es así como se suman. En el documento impreso van en positivo.
 */
export type FiscalBookRowDTO = {
  id: string;
  numeroCompleto: string;
  correlativo: number;
  tipoDocumento: string;
  tipoDocumentoLabel: string;
  caiCodigo: string | null;
  /** Fecha de negocio de la emisión: la que ordena el libro. */
  fechaEmision: string;
  /** Fecha de negocio de la transacción amparada; puede ser anterior. */
  businessDate: string;
  numeroInterno: string | null;
  clienteNombre: string | null;
  clienteRtn: string | null;
  sucursalNombre: string | null;
  origen: 'compra' | 'venta' | 'molido' | null;
  importeExento: number;
  importeExonerado: number;
  importeGravado15: number;
  importeGravado18: number;
  isv15: number;
  isv18: number;
  total: number;
  estado: string;
  anulado: boolean;
  anulacionMotivo: string | null;
  emitidoPor: string;
  /** Nota de crédito o débito: corrige el documento `documentoOrigenNumero`. */
  esNota: boolean;
  /** `-1` en una nota de crédito, `1` en todo lo demás. Ya aplicado a los importes. */
  signo: 1 | -1;
  notaMotivo: string | null;
  documentoOrigenNumero: string | null;
};

/**
 * Hueco en la numeración dentro del período: números del rango que no aparecen entre
 * el primero y el último emitido. No es un error por sí mismo —un talonario puede
 * tener una hoja dañada— pero es lo que la contadora debe poder explicar.
 */
export type FiscalBookGapDTO = {
  caiCodigo: string | null;
  tipoDocumentoLabel: string;
  desde: number;
  hasta: number;
  cantidad: number;
};

export type FiscalBookReportDTO = {
  /** `compras` (boletas de compra) o `ventas` (facturas). */
  libro: 'compras' | 'ventas';
  from: string;
  to: string;
  rows: FiscalBookRowDTO[];
  /** Los anulados aparecen en `rows` pero **no** suman en los totales. */
  totals: {
    documentos: number;
    anulados: number;
    importeExento: number;
    importeExonerado: number;
    importeGravado15: number;
    importeGravado18: number;
    isv15: number;
    isv18: number;
    total: number;
    /** Lo que habría sumado lo anulado, para poder cuadrar contra el talonario. */
    totalAnulado: number;
  };
  saltos: FiscalBookGapDTO[];
};

/** Transacción que todavía no tiene documento fiscal. */
export type FiscalPendingRowDTO = {
  origen: 'compra' | 'venta' | 'molido';
  origenLabel: string;
  transactionId: string;
  businessDate: string;
  numeroInterno: string | null;
  clienteNombre: string;
  sucursalNombre: string;
  total: number;
  /** Días de negocio transcurridos desde la transacción; 0 si es de hoy. */
  diasSinEmitir: number;
};

export type FiscalPendingReportDTO = {
  from: string;
  to: string;
  sucursalId: string | null;
  rows: FiscalPendingRowDTO[];
  totals: {
    documentos: number;
    total: number;
    porOrigen: Array<{
      origen: 'compra' | 'venta' | 'molido';
      origenLabel: string;
      documentos: number;
      total: number;
    }>;
  };
};
