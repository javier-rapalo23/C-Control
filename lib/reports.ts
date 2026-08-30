import { Prisma, PrismaClient } from '@prisma/client';
import {
  eachBusinessDate,
  eachBusinessWeek,
  formatBusinessRange,
  parseBusinessDate,
  toBusinessDateString,
} from '@/lib/business-date';
import { decimalToNumber } from '@/lib/ledger';
import { BANK_EXPENSE_CATEGORY } from '@/lib/expenses';
import type {
  ExpenseReportDTO,
  ExpenseReportGroupDTO,
  ExpenseReportPeriodDTO,
  PurchaseReportBreakdownDTO,
  PurchaseReportDTO,
  PurchaseReportPeriodDTO,
  SaleReportBreakdownDTO,
  SaleReportDTO,
  SaleReportPeriodDTO,
} from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PurchaseReportGroupBy = 'day' | 'week';

/**
 * Acumulador compartido por compras y ventas: los dos agregan libras, quintales
 * oro y lempiras sobre las mismas dimensiones.
 *
 * El conteo se llama `numeroRegistros` y no `numeroCompras` porque cada reporte lo
 * publica con su propio nombre (`numeroCompras` / `numeroVentas`) al armar el DTO.
 */
type Accumulator = {
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroRegistros: number;
};

const emptyAccumulator = (): Accumulator => ({
  totalLibras: 0,
  totalQuintalesOro: 0,
  totalLempiras: 0,
  numeroRegistros: 0,
});

function accumulate(target: Accumulator, libras: number, quintalesOro: number, total: number): void {
  target.totalLibras += libras;
  target.totalQuintalesOro += quintalesOro;
  target.totalLempiras += total;
  target.numeroRegistros += 1;
}

function addAccumulator(target: Accumulator, source: Accumulator): void {
  target.totalLibras += source.totalLibras;
  target.totalQuintalesOro += source.totalQuintalesOro;
  target.totalLempiras += source.totalLempiras;
  target.numeroRegistros += source.numeroRegistros;
}

const round = (value: number, decimals = 2): number => Number(value.toFixed(decimals));

type RoundedTotals = {
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
};

function roundTotals(acc: Accumulator): RoundedTotals {
  return {
    totalLibras: round(acc.totalLibras),
    totalQuintalesOro: round(acc.totalQuintalesOro),
    totalLempiras: round(acc.totalLempiras),
  };
}

/** Entradas del desglose ordenadas por monto descendente, sin nombrar aún el conteo. */
function sortedEntries(
  entries: Map<string, { nombre: string; acc: Accumulator }>,
): Array<{ id: string; nombre: string; totals: RoundedTotals; numeroRegistros: number }> {
  return [...entries.entries()]
    .map(([id, { nombre, acc }]) => ({ id, nombre, totals: roundTotals(acc), numeroRegistros: acc.numeroRegistros }))
    .sort((a, b) => b.totals.totalLempiras - a.totals.totalLempiras);
}

function toPurchaseBreakdown(entries: Map<string, { nombre: string; acc: Accumulator }>): PurchaseReportBreakdownDTO[] {
  return sortedEntries(entries).map(({ id, nombre, totals, numeroRegistros }) => ({
    id,
    nombre,
    ...totals,
    numeroCompras: numeroRegistros,
  }));
}

function toSaleBreakdown(entries: Map<string, { nombre: string; acc: Accumulator }>): SaleReportBreakdownDTO[] {
  return sortedEntries(entries).map(({ id, nombre, totals, numeroRegistros }) => ({
    id,
    nombre,
    ...totals,
    numeroVentas: numeroRegistros,
  }));
}

/** Rangos de agrupación: un día cada uno, o semanas de domingo a sábado. */
function buildRanges(from: string, to: string, groupBy: PurchaseReportGroupBy) {
  return groupBy === 'week'
    ? eachBusinessWeek(from, to)
    : eachBusinessDate(from, to).map((date) => ({ inicio: date, fin: date }));
}

/** Suma los días que caen dentro de un rango; ausentes cuentan como cero. */
function accumulateRange(byDate: Map<string, Accumulator>, inicio: string, fin: string): Accumulator {
  const acc = emptyAccumulator();
  for (const date of eachBusinessDate(inicio, fin)) {
    const dayTotals = byDate.get(date);
    if (dayTotals) addAccumulator(acc, dayTotals);
  }
  return acc;
}

/**
 * Reporte de compras por rango, agrupado por día o por semana.
 *
 * Los períodos se generan desde el calendario y no desde los datos, de modo que un
 * día o una semana sin compras aparezca en cero en vez de desaparecer del reporte.
 */
export async function getPurchaseReport(
  db: DbClient,
  input: { from: string; to: string; groupBy: PurchaseReportGroupBy; sucursalId?: string | null },
): Promise<PurchaseReportDTO> {
  const { from, to, groupBy } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  const purchases = await db.purchase.findMany({
    where: {
      businessDate: { gte: parseBusinessDate(from), lte: parseBusinessDate(to) },
      ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
    },
    select: {
      businessDate: true,
      productoId: true,
      productoNombre: true,
      libras: true,
      quintalesOro: true,
      total: true,
      purchaseTransaction: { select: { client: { select: { id: true, nombres: true, apellidos: true } } } },
    },
  });

  const byDate = new Map<string, Accumulator>();
  const byProducto = new Map<string, { nombre: string; acc: Accumulator }>();
  const byCliente = new Map<string, { nombre: string; acc: Accumulator }>();
  const totals = emptyAccumulator();

  for (const purchase of purchases) {
    const date = toBusinessDateString(purchase.businessDate);
    const libras = decimalToNumber(purchase.libras);
    const quintalesOro = decimalToNumber(purchase.quintalesOro);
    const total = decimalToNumber(purchase.total);

    if (!byDate.has(date)) byDate.set(date, emptyAccumulator());
    accumulate(byDate.get(date)!, libras, quintalesOro, total);
    accumulate(totals, libras, quintalesOro, total);

    if (!byProducto.has(purchase.productoId)) {
      byProducto.set(purchase.productoId, { nombre: purchase.productoNombre, acc: emptyAccumulator() });
    }
    accumulate(byProducto.get(purchase.productoId)!.acc, libras, quintalesOro, total);

    // La cabecera de transacción es obligatoria en el esquema, así que toda compra
    // tiene cliente: no hace falta un grupo "Sin cliente".
    const client = purchase.purchaseTransaction.client;
    if (!byCliente.has(client.id)) {
      byCliente.set(client.id, { nombre: `${client.nombres ?? ''} ${client.apellidos ?? ''}`.trim(), acc: emptyAccumulator() });
    }
    accumulate(byCliente.get(client.id)!.acc, libras, quintalesOro, total);
  }

  // Los períodos se generan desde el calendario, no desde los datos: así un día o
  // una semana sin compras aparece en cero en vez de desaparecer del reporte.
  const periods: PurchaseReportPeriodDTO[] = buildRanges(from, to, groupBy).map((range) => {
    const acc = accumulateRange(byDate, range.inicio, range.fin);
    return {
      inicio: range.inicio,
      fin: range.fin,
      label: groupBy === 'week' ? formatBusinessRange(range.inicio, range.fin) : range.inicio,
      ...roundTotals(acc),
      numeroCompras: acc.numeroRegistros,
    };
  });

  return {
    from,
    to,
    groupBy,
    sucursalId: input.sucursalId ?? null,
    totals: {
      ...roundTotals(totals),
      numeroCompras: totals.numeroRegistros,
      // Precio promedio real del período: no es el promedio de los precios
      // unitarios, sino el total pagado dividido entre las libras compradas.
      promedioPorLibra: totals.totalLibras > 0 ? round(totals.totalLempiras / totals.totalLibras, 4) : 0,
    },
    periods,
    porProducto: toPurchaseBreakdown(byProducto),
    porCliente: toPurchaseBreakdown(byCliente),
  };
}

/**
 * Reporte de ventas por rango, agrupado por día o por semana.
 *
 * Es el espejo del de compras, con dos diferencias que vienen del modelo: el monto
 * vive en `Sale.monto` (no `total`), y producto, libras y quintales oro son
 * opcionales, porque una venta puede registrarse sin desglose de producto.
 */
export async function getSaleReport(
  db: DbClient,
  input: { from: string; to: string; groupBy: PurchaseReportGroupBy; sucursalId?: string | null },
): Promise<SaleReportDTO> {
  const { from, to, groupBy } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  const sales = await db.sale.findMany({
    where: {
      businessDate: { gte: parseBusinessDate(from), lte: parseBusinessDate(to) },
      ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
    },
    select: {
      businessDate: true,
      productoId: true,
      productoNombre: true,
      libras: true,
      quintalesOro: true,
      monto: true,
      saleTransaction: { select: { client: { select: { id: true, nombres: true, apellidos: true } } } },
    },
  });

  const byDate = new Map<string, Accumulator>();
  const byProducto = new Map<string, { nombre: string; acc: Accumulator }>();
  const byCliente = new Map<string, { nombre: string; acc: Accumulator }>();
  const totals = emptyAccumulator();

  for (const sale of sales) {
    const date = toBusinessDateString(sale.businessDate);
    const libras = decimalToNumber(sale.libras);
    const quintalesOro = decimalToNumber(sale.quintalesOro);
    const monto = decimalToNumber(sale.monto);

    if (!byDate.has(date)) byDate.set(date, emptyAccumulator());
    accumulate(byDate.get(date)!, libras, quintalesOro, monto);
    accumulate(totals, libras, quintalesOro, monto);

    // Una venta sin producto sigue siendo dinero cobrado: se agrupa aparte en vez
    // de descartarla, para que el desglose cuadre con el total del período.
    const productoId = sale.productoId ?? '__sin_producto__';
    if (!byProducto.has(productoId)) {
      byProducto.set(productoId, { nombre: sale.productoNombre ?? 'Sin producto', acc: emptyAccumulator() });
    }
    accumulate(byProducto.get(productoId)!.acc, libras, quintalesOro, monto);

    const client = sale.saleTransaction.client;
    if (!byCliente.has(client.id)) {
      byCliente.set(client.id, {
        nombre: `${client.nombres ?? ''} ${client.apellidos ?? ''}`.trim(),
        acc: emptyAccumulator(),
      });
    }
    accumulate(byCliente.get(client.id)!.acc, libras, quintalesOro, monto);
  }

  const periods: SaleReportPeriodDTO[] = buildRanges(from, to, groupBy).map((range) => {
    const acc = accumulateRange(byDate, range.inicio, range.fin);
    return {
      inicio: range.inicio,
      fin: range.fin,
      label: groupBy === 'week' ? formatBusinessRange(range.inicio, range.fin) : range.inicio,
      ...roundTotals(acc),
      numeroVentas: acc.numeroRegistros,
    };
  });

  return {
    from,
    to,
    groupBy,
    sucursalId: input.sucursalId ?? null,
    totals: {
      ...roundTotals(totals),
      numeroVentas: totals.numeroRegistros,
      promedioPorLibra: totals.totalLibras > 0 ? round(totals.totalLempiras / totals.totalLibras, 4) : 0,
      // El café se vende por quintal oro, así que este es el precio que interesa
      // comparar entre semanas. Cero cuando no hubo ventas en oro.
      promedioPorQuintalOro:
        totals.totalQuintalesOro > 0 ? round(totals.totalLempiras / totals.totalQuintalesOro, 4) : 0,
    },
    periods,
    porProducto: toSaleBreakdown(byProducto),
    porCliente: toSaleBreakdown(byCliente),
  };
}

type ExpenseAccumulator = {
  total: number;
  numeroGastos: number;
};

const emptyExpenseAccumulator = (): ExpenseAccumulator => ({ total: 0, numeroGastos: 0 });

function accumulateExpense(target: ExpenseAccumulator, monto: number): void {
  target.total += monto;
  target.numeroGastos += 1;
}

function toExpenseGroups(
  entries: Map<string, ExpenseAccumulator>,
  totalPeriodo: number,
): ExpenseReportGroupDTO[] {
  return [...entries.entries()]
    .map(([nombre, acc]) => ({
      nombre,
      total: round(acc.total),
      numeroGastos: acc.numeroGastos,
      porcentaje: totalPeriodo > 0 ? round((acc.total / totalPeriodo) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Reporte de gastos por rango, agrupado por día o por semana.
 *
 * Devuelve además el desglose por categoría y, dentro de "Pago banco", el desglose
 * por banco: es la pregunta que el cliente hace del gasto ("cuánto va a cada banco
 * y en qué fecha") y que el texto libre de categoría no permitía responder.
 */
export async function getExpenseReport(
  db: DbClient,
  input: { from: string; to: string; groupBy: PurchaseReportGroupBy; sucursalId?: string | null },
): Promise<ExpenseReportDTO> {
  const { from, to, groupBy } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  const expenses = await db.expense.findMany({
    where: {
      businessDate: { gte: parseBusinessDate(from), lte: parseBusinessDate(to) },
      ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
    },
    select: {
      businessDate: true,
      categoria: true,
      monto: true,
      banco: { select: { nombre: true } },
    },
  });

  const byDate = new Map<string, ExpenseAccumulator>();
  const byCategoria = new Map<string, ExpenseAccumulator>();
  const byBanco = new Map<string, ExpenseAccumulator>();
  const totals = emptyExpenseAccumulator();

  for (const expense of expenses) {
    const date = toBusinessDateString(expense.businessDate);
    const monto = decimalToNumber(expense.monto);

    if (!byDate.has(date)) byDate.set(date, emptyExpenseAccumulator());
    accumulateExpense(byDate.get(date)!, monto);
    accumulateExpense(totals, monto);

    if (!byCategoria.has(expense.categoria)) byCategoria.set(expense.categoria, emptyExpenseAccumulator());
    accumulateExpense(byCategoria.get(expense.categoria)!, monto);

    if (expense.categoria === BANK_EXPENSE_CATEGORY) {
      // Un pago de banco sin banco solo puede venir de datos anteriores al catálogo:
      // se agrupa aparte en vez de descartarlo, para que el desglose cuadre con el total.
      const nombre = expense.banco?.nombre ?? 'Sin banco';
      if (!byBanco.has(nombre)) byBanco.set(nombre, emptyExpenseAccumulator());
      accumulateExpense(byBanco.get(nombre)!, monto);
    }
  }

  // Como en el reporte de compras, los períodos salen del calendario y no de los
  // datos: un día sin gastos aparece en cero en vez de desaparecer.
  const ranges =
    groupBy === 'week'
      ? eachBusinessWeek(from, to)
      : eachBusinessDate(from, to).map((date) => ({ inicio: date, fin: date }));

  const periods: ExpenseReportPeriodDTO[] = ranges.map((range) => {
    const acc = emptyExpenseAccumulator();
    for (const date of eachBusinessDate(range.inicio, range.fin)) {
      const dayTotals = byDate.get(date);
      if (!dayTotals) continue;
      acc.total += dayTotals.total;
      acc.numeroGastos += dayTotals.numeroGastos;
    }

    return {
      inicio: range.inicio,
      fin: range.fin,
      label: groupBy === 'week' ? formatBusinessRange(range.inicio, range.fin) : range.inicio,
      total: round(acc.total),
      numeroGastos: acc.numeroGastos,
    };
  });

  return {
    from,
    to,
    groupBy,
    sucursalId: input.sucursalId ?? null,
    totals: { total: round(totals.total), numeroGastos: totals.numeroGastos },
    periods,
    porCategoria: toExpenseGroups(byCategoria, totals.total),
    porBanco: toExpenseGroups(byBanco, totals.total),
  };
}
