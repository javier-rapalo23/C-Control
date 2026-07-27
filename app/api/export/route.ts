import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDateParam = searchParams.get('businessDate');
    const sucursalIdParam = searchParams.get('sucursalId');

    const where: { businessDate?: Date; sucursalId?: string } = {};
    if (businessDateParam) where.businessDate = parseBusinessDate(businessDateParam);
    if (sucursalIdParam) where.sucursalId = sucursalIdParam;

    const [dailyBalances, purchases, sales, expenses, productos, syncEvents, clients, purchaseTransactions, saleTransactions, sucursales] =
      await Promise.all([
        prisma.dailyBalance.findMany({ where, orderBy: { businessDate: 'asc' } }),
        prisma.purchase.findMany({ where, orderBy: { createdAt: 'asc' } }),
        prisma.sale.findMany({ where, orderBy: { createdAt: 'asc' } }),
        prisma.expense.findMany({ where, orderBy: { createdAt: 'asc' } }),
        prisma.producto.findMany({ orderBy: { createdAt: 'asc' } }),
        prisma.syncEvent.findMany({ orderBy: { createdAt: 'asc' } }),
        prisma.client.findMany({ orderBy: [{ esGeneral: 'desc' }, { createdAt: 'asc' }] }),
        prisma.purchaseTransaction.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          include: { client: true, items: { orderBy: { createdAt: 'asc' } } },
        }),
        prisma.saleTransaction.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          include: { client: true, items: { orderBy: { createdAt: 'asc' } } },
        }),
        prisma.sucursal.findMany({ orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }] }),
      ]);

    return success({
      generatedAt: new Date().toISOString(),
      filters: {
        businessDate: businessDateParam,
        sucursalId: sucursalIdParam,
      },
      data: {
        sucursales: sucursales.map((item) => ({
          ...item,
          direccion: item.direccion ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        dailyBalances: dailyBalances.map((item) => ({
          ...item,
          businessDate: toBusinessDateString(item.businessDate),
          saldoInicial: Number(item.saldoInicial),
          saldoActual: Number(item.saldoActual),
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        purchases: purchases.map((item) => ({
          ...item,
          businessDate: toBusinessDateString(item.businessDate),
          precioPorLibra: Number(item.precioPorLibra),
          pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
          numeroSacos: item.numeroSacos,
          taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
          quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
          libras: Number(item.libras),
          total: Number(item.total),
          createdAt: item.createdAt.toISOString(),
        })),
        sales: sales.map((item) => ({
          ...item,
          businessDate: toBusinessDateString(item.businessDate),
          precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : null,
          libras: item.libras !== null ? Number(item.libras) : null,
          monto: Number(item.monto),
          createdAt: item.createdAt.toISOString(),
        })),
        expenses: expenses.map((item) => ({
          ...item,
          businessDate: toBusinessDateString(item.businessDate),
          monto: Number(item.monto),
          createdAt: item.createdAt.toISOString(),
        })),
        productos: productos.map((item) => ({
          ...item,
          precioPorLibra: Number(item.precioPorLibra),
          taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
          factorConversionOro: item.factorConversionOro !== null ? Number(item.factorConversionOro) : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        clients: clients.map((item) => ({
          ...item,
          telefono: item.telefono ?? null,
          direccion: item.direccion ?? null,
          rtn: item.rtn ?? null,
          cuentaBancaria: item.cuentaBancaria ?? null,
          notas: item.notas ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        purchaseTransactions: purchaseTransactions.map((transaction) => ({
          ...transaction,
          businessDate: toBusinessDateString(transaction.businessDate),
          total: Number(transaction.total),
          createdAt: transaction.createdAt.toISOString(),
          updatedAt: transaction.updatedAt.toISOString(),
          client: {
            ...transaction.client,
            telefono: transaction.client.telefono ?? null,
            direccion: transaction.client.direccion ?? null,
            rtn: transaction.client.rtn ?? null,
            cuentaBancaria: transaction.client.cuentaBancaria ?? null,
            notas: transaction.client.notas ?? null,
            createdAt: transaction.client.createdAt.toISOString(),
            updatedAt: transaction.client.updatedAt.toISOString(),
          },
          items: transaction.items.map((item) => ({
            ...item,
            businessDate: toBusinessDateString(item.businessDate),
            precioPorLibra: Number(item.precioPorLibra),
            pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
            numeroSacos: item.numeroSacos,
            taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
            quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
            libras: Number(item.libras),
            total: Number(item.total),
            createdAt: item.createdAt.toISOString(),
          })),
        })),
        saleTransactions: saleTransactions.map((transaction) => ({
          ...transaction,
          businessDate: toBusinessDateString(transaction.businessDate),
          total: Number(transaction.total),
          createdAt: transaction.createdAt.toISOString(),
          updatedAt: transaction.updatedAt.toISOString(),
          client: {
            ...transaction.client,
            telefono: transaction.client.telefono ?? null,
            direccion: transaction.client.direccion ?? null,
            rtn: transaction.client.rtn ?? null,
            cuentaBancaria: transaction.client.cuentaBancaria ?? null,
            notas: transaction.client.notas ?? null,
            createdAt: transaction.client.createdAt.toISOString(),
            updatedAt: transaction.client.updatedAt.toISOString(),
          },
          items: transaction.items.map((item) => ({
            ...item,
            businessDate: toBusinessDateString(item.businessDate),
            precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : null,
            libras: item.libras !== null ? Number(item.libras) : null,
            monto: Number(item.monto),
            createdAt: item.createdAt.toISOString(),
          })),
        })),
        syncEvents: syncEvents.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}