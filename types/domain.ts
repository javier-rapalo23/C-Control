export type ProductoDTO = {
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
  productoId: string;
  productoNombre: string;
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
  printerIp: string;
  printerPort: number;
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

export type ProductoCargaDTO = {
  id: string;
  businessDate: string;
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