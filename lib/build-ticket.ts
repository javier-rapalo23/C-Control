import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';
import { buildTicketBuffer, buildSummaryBuffer } from '@/lib/thermal-printer';
import { decimalToNumber, getLedgerByDate, resolveSucursalId } from '@/lib/ledger';
import { getCashSession } from '@/lib/cash-session';

export async function buildTicketForTransaction(transactionId: string) {
  const [transaction, company] = await Promise.all([
    prisma.purchaseTransaction.findUnique({
      where: { id: transactionId },
      include: { client: true, sucursal: true, items: { orderBy: { createdAt: 'asc' } } },
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
    sucursalNombre: transaction.sucursal.nombre,
    clientNombre: transaction.client.nombre,
    items: transaction.items.map((item) => ({
      productoNombre: item.productoNombre,
      libras: Number(item.libras),
      precioPorLibra: Number(item.precioPorLibra),
      total: Number(item.total),
      pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
      numeroSacos: item.numeroSacos,
      quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
    })),
    total: Number(transaction.total),
  });

  return { buffer, company };
}

export async function buildTicketForSaleTransaction(transactionId: string) {
  const [transaction, company] = await Promise.all([
    prisma.saleTransaction.findUnique({
      where: { id: transactionId },
      include: { client: true, sucursal: true, items: { orderBy: { createdAt: 'asc' } } },
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
    sucursalNombre: transaction.sucursal.nombre,
    clientNombre: transaction.client.nombre,
    items: transaction.items.map((item) => ({
      productoNombre: item.productoNombre ?? '',
      libras: item.libras !== null ? Number(item.libras) : 0,
      precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : 0,
      total: Number(item.monto),
      porcentajeOro: item.porcentajeOro !== null ? Number(item.porcentajeOro) : null,
      quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
      precioPorQuintalOro: item.precioPorQuintalOro !== null ? Number(item.precioPorQuintalOro) : null,
    })),
    total: Number(transaction.total),
    title: 'Comprobante de Venta',
  });

  return { buffer, company };
}

export async function buildSummaryForDate(businessDate: string, sucursalIdInput?: string | null) {
  const sucursalId = await resolveSucursalId(prisma, sucursalIdInput);
  const [company, ledger, sucursal, cashSession] = await Promise.all([
    prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    }),
    getLedgerByDate(prisma, businessDate, sucursalId),
    prisma.sucursal.findUnique({ where: { id: sucursalId } }),
    getCashSession(prisma, businessDate, sucursalId),
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
    sucursalNombre: sucursal?.nombre,
    productos: Object.values(byProducto).sort((a, b) => b.total - a.total),
    totalCompras: ledger.totals.totalCompras,
    totalComprasOtrosMedios: ledger.totals.totalComprasOtrosMedios,
    totalVentas: ledger.totals.totalVentas,
    totalGastos: ledger.totals.totalGastos,
    totalIngresos: ledger.totals.totalIngresos,
    saldoInicial: ledger.balance.saldoInicial,
    saldoActual: ledger.totals.saldoActual,
    arqueo: cashSession
      ? {
          estado: cashSession.estado as 'abierta' | 'cerrada',
          montoApertura: decimalToNumber(cashSession.montoApertura),
          abiertaPor: cashSession.abiertaPor,
          saldoEsperado: cashSession.saldoEsperado !== null ? decimalToNumber(cashSession.saldoEsperado) : null,
          montoContado: cashSession.montoContado !== null ? decimalToNumber(cashSession.montoContado) : null,
          diferencia: cashSession.diferencia !== null ? decimalToNumber(cashSession.diferencia) : null,
          cerradaPor: cashSession.cerradaPor,
        }
      : null,
  });

  return { buffer, company };
}
