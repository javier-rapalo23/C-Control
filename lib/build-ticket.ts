import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';
import { buildTicketBuffer, buildSummaryBuffer } from '@/lib/thermal-printer';
import { getLedgerByDate } from '@/lib/ledger';

export async function buildTicketForTransaction(transactionId: string) {
  const [transaction, company] = await Promise.all([
    prisma.purchaseTransaction.findUnique({
      where: { id: transactionId },
      include: { client: true, items: { orderBy: { createdAt: 'asc' } } },
    }),
    prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    }),
  ]);

  if (!transaction) {
    return null;
  }

  const buffer = buildTicketBuffer({
    company: {
      nombre: company.nombre,
      rtn: company.rtn,
      telefono: company.telefono,
      direccion: company.direccion,
    },
    businessDate: toBusinessDateString(transaction.businessDate),
    clientNombre: transaction.client.nombre,
    items: transaction.items.map((item) => ({
      productoNombre: item.productoNombre,
      libras: Number(item.libras),
      precioPorLibra: Number(item.precioPorLibra),
      total: Number(item.total),
    })),
    total: Number(transaction.total),
  });

  return { buffer, company };
}

export async function buildSummaryForDate(businessDate: string) {
  const [company, ledger] = await Promise.all([
    prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    }),
    getLedgerByDate(prisma, businessDate),
  ]);

  const byProducto: Record<string, { productoNombre: string; libras: number; total: number }> = {};
  for (const p of ledger.purchases) {
    if (!byProducto[p.productoId]) byProducto[p.productoId] = { productoNombre: p.productoNombre, libras: 0, total: 0 };
    byProducto[p.productoId].libras += p.libras;
    byProducto[p.productoId].total += p.total;
  }

  const buffer = buildSummaryBuffer({
    company: {
      nombre: company.nombre,
      rtn: company.rtn,
      telefono: company.telefono,
      direccion: company.direccion,
    },
    businessDate: ledger.businessDate,
    productos: Object.values(byProducto).sort((a, b) => b.total - a.total),
    totalCompras: ledger.totals.totalCompras,
    totalVentas: ledger.totals.totalVentas,
    totalGastos: ledger.totals.totalGastos,
    saldoInicial: ledger.balance.saldoInicial,
    saldoActual: ledger.totals.saldoActual,
  });

  return { buffer, company };
}
