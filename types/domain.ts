export type SucursalDTO = {
  id: string;
  nombre: string;
  direccion?: string | null;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductoCategoria = 'uva' | 'pergamino';

export type ProductoDTO = {
  id: string;
  nombre: string;
  categoria?: ProductoCategoria | null;
  precioPorLibra: number;
  taraPorSaco?: number | null;
  factorConversionOro?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientDTO = {
  id: string;
  nombre: string;
  nombres?: string | null;
  apellidos?: string | null;
  claveIhcafe?: string | null;
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
  total: number;
  createdAt: string;
  updatedAt: string;
  client: ClientDTO;
  items: PurchaseTransactionItemDTO[];
};

export type SaleDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  productoId?: string | null;
  productoNombre?: string | null;
  precioPorLibra?: number | null;
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
  total: number;
  createdAt: string;
  updatedAt: string;
  client: ClientDTO;
  items: SaleTransactionItemDTO[];
};

export type ExpenseDTO = {
  id: string;
  businessDate: string;
  sucursalId: string;
  categoria: string;
  descripcion: string;
  monto: number;
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
  updatedAt: string;
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
    totalCompras: number;
    totalVentas: number;
    totalGastos: number;
    ajusteCaja: number;
    saldoActual: number;
  };
  purchases: PurchaseDTO[];
  sales: SaleDTO[];
  expenses: ExpenseDTO[];
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
