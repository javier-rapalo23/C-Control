import { Prisma, PrismaClient } from '@prisma/client';
import {
  eachBusinessDate,
  eachBusinessWeek,
  formatBusinessRange,
  parseBusinessDate,
  toBusinessDateString,
} from '@/lib/business-date';
import { decimalToNumber } from '@/lib/ledger';
import type {
  PurchaseReportBreakdownDTO,
  PurchaseReportDTO,
  PurchaseReportPeriodDTO,
} from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PurchaseReportGroupBy = 'day' | 'week';

type Accumulator = {
  totalLibras: number;
  totalQuintalesOro: number;
  totalLempiras: number;
  numeroCompras: number;
};

const emptyAccumulator = (): Accumulator => ({
  totalLibras: 0,
  totalQuintalesOro: 0,
  totalLempiras: 0,
  numeroCompras: 0,
});

function accumulate(target: Accumulator, libras: number, quintalesOro: number, total: number): void {
  target.totalLibras += libras;
  target.totalQuintalesOro += quintalesOro;
  target.totalLempiras += total;
  target.numeroCompras += 1;
}

const round = (value: number, decimals = 2): number => Number(value.toFixed(decimals));

function roundAccumulator(acc: Accumulator): Accumulator {
  return {
    totalLibras: round(acc.totalLibras),
    totalQuintalesOro: round(acc.totalQuintalesOro),
    totalLempiras: round(acc.totalLempiras),
    numeroCompras: acc.numeroCompras,
  };
}

function toBreakdown(entries: Map<string, { nombre: string; acc: Accumulator }>): PurchaseReportBreakdownDTO[] {
  return [...entries.entries()]
    .map(([id, { nombre, acc }]) => ({ id, nombre, ...roundAccumulator(acc) }))
    .sort((a, b) => b.totalLempiras - a.totalLempiras);
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
  const ranges =
    groupBy === 'week'
      ? eachBusinessWeek(from, to)
      : eachBusinessDate(from, to).map((date) => ({ inicio: date, fin: date }));

  const periods: PurchaseReportPeriodDTO[] = ranges.map((range) => {
    const acc = emptyAccumulator();
    for (const date of eachBusinessDate(range.inicio, range.fin)) {
      const dayTotals = byDate.get(date);
      if (!dayTotals) continue;
      acc.totalLibras += dayTotals.totalLibras;
      acc.totalQuintalesOro += dayTotals.totalQuintalesOro;
      acc.totalLempiras += dayTotals.totalLempiras;
      acc.numeroCompras += dayTotals.numeroCompras;
    }

    return {
      inicio: range.inicio,
      fin: range.fin,
      label: groupBy === 'week' ? formatBusinessRange(range.inicio, range.fin) : range.inicio,
      ...roundAccumulator(acc),
    };
  });

  return {
    from,
    to,
    groupBy,
    sucursalId: input.sucursalId ?? null,
    totals: {
      ...roundAccumulator(totals),
      // Precio promedio real del período: no es el promedio de los precios
      // unitarios, sino el total pagado dividido entre las libras compradas.
      promedioPorLibra: totals.totalLibras > 0 ? round(totals.totalLempiras / totals.totalLibras, 4) : 0,
    },
    periods,
    porProducto: toBreakdown(byProducto),
    porCliente: toBreakdown(byCliente),
  };
}
