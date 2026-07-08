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
      materialNombre: item.materialNombre,
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

  const byMaterial: Record<string, { materialNombre: string; libras: number; total: number }> = {};
  for (const p of ledger.purchases) {
    if (!byMaterial[p.materialId]) byMaterial[p.materialId] = { materialNombre: p.materialNombre, libras: 0, total: 0 };
    byMaterial[p.materialId].libras += p.libras;
    byMaterial[p.materialId].total += p.total;
  }

  const buffer = buildSummaryBuffer({
    company: {
      nombre: company.nombre,
      rtn: company.rtn,
      telefono: company.telefono,
      direccion: company.direccion,
    },
    businessDate: ledger.businessDate,
    materials: Object.values(byMaterial).sort((a, b) => b.total - a.total),
    totalCompras: ledger.totals.totalCompras,
    totalVentas: ledger.totals.totalVentas,
    totalGastos: ledger.totals.totalGastos,
    saldoInicial: ledger.balance.saldoInicial,
    saldoActual: ledger.totals.saldoActual,
  });

  return { buffer, company };
}
