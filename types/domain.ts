export type MaterialDTO = {
  id: string;
  nombre: string;
  precioPorLibra: number;
  createdAt: string;
  updatedAt: string;
};

export type ClientDTO = {
  id: string;
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  rtn?: string | null;
  cuentaBancaria?: string | null;
  notas?: string | null;
  esGeneral: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseDTO = {
  id: string;
  businessDate: string;
  materialId: string;
  materialNombre: string;
  precioPorLibra: number;
  libras: number;
  total: number;
  purchaseTransactionId?: string | null;
  createdAt: string;
};

export type PurchaseTransactionItemDTO = PurchaseDTO;

export type PurchaseTransactionDTO = {
  id: string;
  businessDate: string;
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
  descripcion: string;
  monto: number;
  createdAt: string;
};

export type ExpenseDTO = {
  id: string;
  businessDate: string;
  categoria: string;
  descripcion: string;
  monto: number;
  createdAt: string;
};

export type DailyBalanceDTO = {
  id: string;
  businessDate: string;
  saldoInicial: number;
  saldoActual: number;
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
  updatedAt: string;
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

export type MaterialCargaDTO = {
  id: string;
  businessDate: string;
  materialId: string;
  materialNombre: string;
  libras: number | null;
  descripcion: string | null;
  createdAt: string;
};

export type MaterialStockDTO = {
  materialId: string;
  totalLibras: number;
  daily: { businessDate: string; libras: number }[];
  purchases: PurchaseDTO[];
};

export type LedgerDTO = {
  businessDate: string;
  balance: DailyBalanceDTO;
  totals: {
    totalCompras: number;
    totalVentas: number;
    totalGastos: number;
    saldoActual: number;
  };
  purchases: PurchaseDTO[];
  sales: SaleDTO[];
  expenses: ExpenseDTO[];
};