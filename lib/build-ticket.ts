import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';
import { buildTicketBuffer, buildSummaryBuffer, type TicketData } from '@/lib/thermal-printer';
import { decimalToNumber, getLedgerByDate, resolveSucursalId } from '@/lib/ledger';
import {
  buildInvoiceForOrigen,
  buildInvoiceFromDocument,
  formatNumeroInterno,
  type InvoiceData,
} from '@/lib/build-invoice';
import { getCashSession } from '@/lib/cash-session';

/** Tara total en libras. Null cuando la línea no se pesó (ventas y compras viejas). */
function taraTotal(taraPorSaco: Prisma.Decimal | null, numeroSacos: number | null) {
  if (taraPorSaco === null || numeroSacos === null) return null;
  return Number(taraPorSaco) * numeroSacos;
}

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
    numeroInterno: formatNumeroInterno('compra', transaction.numeroInterno),
    kind: 'compra',
    items: transaction.items.map((item) => ({
      productoNombre: item.productoNombre,
      libras: Number(item.libras),
      precioPorLibra: Number(item.precioPorLibra),
      total: Number(item.total),
      pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
      numeroSacos: item.numeroSacos,
      taraTotal: taraTotal(item.taraPorSaco, item.numeroSacos),
      quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
    })),
    bono: Number(transaction.bono),
    bonoMotivo: transaction.bonoMotivo,
    descuento: Number(transaction.descuento),
    descuentoMotivo: transaction.descuentoMotivo,
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
    numeroInterno: formatNumeroInterno('venta', transaction.numeroInterno),
    kind: 'venta',
    items: transaction.items.map((item) => ({
      productoNombre: item.productoNombre ?? '',
      libras: item.libras !== null ? Number(item.libras) : 0,
      precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : 0,
      total: Number(item.monto),
      pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
      numeroSacos: item.numeroSacos,
      taraTotal: taraTotal(item.taraPorSaco, item.numeroSacos),
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
    totalComprasEfectivo: ledger.totals.totalComprasEfectivo,
    totalComprasDeposito: ledger.totals.totalComprasDeposito,
    totalComprasCheque: ledger.totals.totalComprasCheque,
    totalComprasPendientes: ledger.totals.totalComprasPendientes,
    totalVentas: ledger.totals.totalVentas,
    totalGastos: ledger.totals.totalGastos,
    totalIngresos: ledger.totals.totalIngresos,
    totalMolido: ledger.totals.totalMolido,
    totalPagosPendientes: ledger.totals.totalPagosPendientes,
    totalSalidas: ledger.totals.totalSalidas,
    totalTrasladosRecibidos: ledger.totals.totalTrasladosRecibidos,
    totalTrasladosEnviados: ledger.totals.totalTrasladosEnviados,
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

/**
 * Convierte los datos de la factura en datos del ticket.
 *
 * Los dos formatos imprimen **el mismo documento**, así que conviene que salgan de la
 * misma fuente: si ya hay documento fiscal, `buildInvoiceForOrigen` devuelve el
 * snapshot, y el ticket queda idéntico a la hoja en número, CAI y desglose. Sin
 * documento, devuelve los datos vivos y el ticket sale como comprobante interno.
 */
export function ticketDataFromInvoice(data: InvoiceData): TicketData {
  return {
    company: {
      nombre: data.empresa.nombre,
      rtn: data.empresa.rtn,
      telefono: data.empresa.telefono,
      direccion: data.empresa.direccion,
    },
    businessDate: data.businessDate,
    sucursalNombre: data.sucursalNombre,
    clientNombre: data.cliente.nombre,
    kind: data.kind,
    numeroInterno: data.numeroInterno || undefined,
    title: data.titulo,
    documento: data.documento ?? null,
    items: data.lineas.map((linea) => ({
      productoNombre: linea.productoNombre,
      libras: linea.libras,
      precioPorLibra: linea.precioPorLibra ?? 0,
      total: linea.total,
      pesoBruto: linea.pesoBruto,
      numeroSacos: linea.numeroSacos,
      taraTotal:
        linea.taraPorSaco !== null && linea.numeroSacos !== null ? linea.taraPorSaco * linea.numeroSacos : null,
      quintalesOro: linea.quintalesOro,
      porcentajeOro: linea.porcentajeOro,
      precioPorQuintalOro: linea.precioPorQuintalOro,
    })),
    subtotal: data.subtotal,
    bono: data.bono,
    bonoMotivo: data.bonoMotivo,
    descuento: data.descuento,
    descuentoMotivo: data.descuentoMotivo,
    total: data.total,
  };
}

/**
 * Ticket de 80 mm de una compra, una venta o un molido, con su documento fiscal si ya
 * se emitió. Es la contraparte de `/print/<origen>/:id`, que imprime lo mismo en A4.
 *
 * Con `origen = 'nota'`, el id es el **del documento** y no el de una transacción: una
 * nota de crédito no ampara ninguna, así que se lee directo de su snapshot.
 */
export async function buildTicketForOrigen(origen: 'compra' | 'venta' | 'molido' | 'nota', id: string) {
  const [data, company] = await Promise.all([
    origen === 'nota' ? buildInvoiceFromDocument(id) : buildInvoiceForOrigen(origen, id),
    prisma.companySettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } }),
  ]);

  if (!data) {
    return null;
  }

  return { buffer: buildTicketBuffer(ticketDataFromInvoice(data)), company, documento: data.documento ?? null };
}
