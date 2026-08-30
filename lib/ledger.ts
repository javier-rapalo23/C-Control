import { Prisma, PrismaClient } from '@prisma/client';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import type {
  DailyBalanceDTO,
  ExpenseDTO,
  LedgerDTO,
  PurchaseDTO,
  SaleDTO,
} from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

export function decimalToNumber(value: Prisma.Decimal | number | string | null): number {
  if (value === null) {
    return 0;
  }

  return Number(value);
}

export async function getDefaultSucursalId(db: DbClient): Promise<string> {
  const existing = await db.sucursal.findFirst({
    where: { esPrincipal: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    return existing.id;
  }

  const anySucursal = await db.sucursal.findFirst({ orderBy: { createdAt: 'asc' } });
  if (anySucursal) {
    return anySucursal.id;
  }

  const created = await db.sucursal.create({
    data: { nombre: 'Sucursal Principal', esPrincipal: true },
  });
  return created.id;
}

export async function resolveSucursalId(db: DbClient, sucursalId?: string | null): Promise<string> {
  if (sucursalId) {
    return sucursalId;
  }
  return getDefaultSucursalId(db);
}

function mapBalance(balance: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  saldoInicial: Prisma.Decimal;
  saldoActual: Prisma.Decimal;
  ajusteCaja: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): DailyBalanceDTO {
  return {
    id: balance.id,
    businessDate: toBusinessDateString(balance.businessDate),
    sucursalId: balance.sucursalId,
    saldoInicial: decimalToNumber(balance.saldoInicial),
    saldoActual: decimalToNumber(balance.saldoActual),
    ajusteCaja: decimalToNumber(balance.ajusteCaja),
    createdAt: balance.createdAt.toISOString(),
    updatedAt: balance.updatedAt.toISOString(),
  };
}

function mapPurchase(purchase: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  productoId: string;
  productoNombre: string;
  precioPorLibra: Prisma.Decimal;
  pesoBruto: Prisma.Decimal | null;
  numeroSacos: number | null;
  taraPorSaco: Prisma.Decimal | null;
  quintalesOro: Prisma.Decimal | null;
  libras: Prisma.Decimal;
  total: Prisma.Decimal;
  purchaseTransactionId: string;
  createdAt: Date;
}): PurchaseDTO {
  return {
    id: purchase.id,
    businessDate: toBusinessDateString(purchase.businessDate),
    sucursalId: purchase.sucursalId,
    productoId: purchase.productoId,
    productoNombre: purchase.productoNombre,
    precioPorLibra: decimalToNumber(purchase.precioPorLibra),
    pesoBruto: purchase.pesoBruto !== null ? decimalToNumber(purchase.pesoBruto) : null,
    numeroSacos: purchase.numeroSacos,
    taraPorSaco: purchase.taraPorSaco !== null ? decimalToNumber(purchase.taraPorSaco) : null,
    quintalesOro: purchase.quintalesOro !== null ? decimalToNumber(purchase.quintalesOro) : null,
    libras: decimalToNumber(purchase.libras),
    total: decimalToNumber(purchase.total),
    purchaseTransactionId: purchase.purchaseTransactionId,
    createdAt: purchase.createdAt.toISOString(),
  };
}

function mapSale(sale: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  productoId: string | null;
  productoNombre: string | null;
  precioPorLibra: Prisma.Decimal | null;
  libras: Prisma.Decimal | null;
  porcentajeOro: Prisma.Decimal | null;
  quintalesOro: Prisma.Decimal | null;
  precioPorQuintalOro: Prisma.Decimal | null;
  descripcion: string | null;
  monto: Prisma.Decimal;
  saleTransactionId: string;
  createdAt: Date;
}): SaleDTO {
  return {
    id: sale.id,
    businessDate: toBusinessDateString(sale.businessDate),
    sucursalId: sale.sucursalId,
    productoId: sale.productoId,
    productoNombre: sale.productoNombre,
    precioPorLibra: sale.precioPorLibra !== null ? decimalToNumber(sale.precioPorLibra) : null,
    libras: sale.libras !== null ? decimalToNumber(sale.libras) : null,
    porcentajeOro: sale.porcentajeOro !== null ? decimalToNumber(sale.porcentajeOro) : null,
    quintalesOro: sale.quintalesOro !== null ? decimalToNumber(sale.quintalesOro) : null,
    precioPorQuintalOro: sale.precioPorQuintalOro !== null ? decimalToNumber(sale.precioPorQuintalOro) : null,
    descripcion: sale.descripcion,
    monto: decimalToNumber(sale.monto),
    saleTransactionId: sale.saleTransactionId,
    createdAt: sale.createdAt.toISOString(),
  };
}

function mapExpense(expense: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  categoria: string;
  bancoId: string | null;
  descripcion: string;
  monto: Prisma.Decimal;
  createdAt: Date;
  banco?: { nombre: string } | null;
}): ExpenseDTO {
  return {
    id: expense.id,
    businessDate: toBusinessDateString(expense.businessDate),
    sucursalId: expense.sucursalId,
    categoria: expense.categoria,
    bancoId: expense.bancoId,
    bancoNombre: expense.banco?.nombre ?? null,
    descripcion: expense.descripcion,
    monto: decimalToNumber(expense.monto),
    createdAt: expense.createdAt.toISOString(),
  };
}

export async function ensureDailyBalance(db: DbClient, businessDateInput: string, sucursalId: string) {
  const businessDate = parseBusinessDate(businessDateInput);

  return db.dailyBalance.upsert({
    where: { businessDate_sucursalId: { businessDate, sucursalId } },
    update: {},
    create: {
      businessDate,
      sucursalId,
      saldoInicial: 0,
      saldoActual: 0,
    },
  });
}

export async function recalculateDailyBalance(db: DbClient, businessDateInput: string, sucursalId: string) {
  const businessDate = parseBusinessDate(businessDateInput);
  const balance = await ensureDailyBalance(db, businessDateInput, sucursalId);

  const [comprasAgg, ventasAgg, gastosAgg] = await Promise.all([
    db.purchase.aggregate({
      where: { businessDate, sucursalId },
      _sum: { total: true },
    }),
    db.sale.aggregate({
      where: { businessDate, sucursalId },
      _sum: { monto: true },
    }),
    db.expense.aggregate({
      where: { businessDate, sucursalId },
      _sum: { monto: true },
    }),
  ]);

  const totalCompras = decimalToNumber(comprasAgg._sum.total);
  const totalVentas = decimalToNumber(ventasAgg._sum.monto);
  const totalGastos = decimalToNumber(gastosAgg._sum.monto);
  const saldoInicial = decimalToNumber(balance.saldoInicial);
  // El ajuste del arqueo entra en la ecuación para que, una vez cerrada la caja,
  // el saldo sea el efectivo contado y no el teórico. Vale 0 mientras no se cierre,
  // así que las fechas sin arqueo se comportan igual que antes.
  const ajusteCaja = decimalToNumber(balance.ajusteCaja);
  const saldoActual = saldoInicial + totalVentas - totalCompras - totalGastos + ajusteCaja;

  const updated = await db.dailyBalance.update({
    where: { id: balance.id },
    data: { saldoActual },
  });

  return {
    balance: mapBalance(updated),
    totals: {
      totalCompras,
      totalVentas,
      totalGastos,
      ajusteCaja,
      saldoActual,
    },
  };
}

export async function getLedgerByDate(db: DbClient, businessDateInput: string, sucursalId: string): Promise<LedgerDTO> {
  const businessDate = parseBusinessDate(businessDateInput);
  await ensureDailyBalance(db, businessDateInput, sucursalId);
  const recalculated = await recalculateDailyBalance(db, businessDateInput, sucursalId);

  const [purchases, sales, expenses] = await Promise.all([
    db.purchase.findMany({ where: { businessDate, sucursalId }, orderBy: { createdAt: 'desc' } }),
    db.sale.findMany({ where: { businessDate, sucursalId }, orderBy: { createdAt: 'desc' } }),
    db.expense.findMany({
      where: { businessDate, sucursalId },
      orderBy: { createdAt: 'desc' },
      include: { banco: { select: { nombre: true } } },
    }),
  ]);

  return {
    businessDate: toBusinessDateString(businessDate),
    sucursalId,
    balance: recalculated.balance,
    totals: recalculated.totals,
    purchases: purchases.map(mapPurchase),
    sales: sales.map(mapSale),
    expenses: expenses.map(mapExpense),
  };
}
