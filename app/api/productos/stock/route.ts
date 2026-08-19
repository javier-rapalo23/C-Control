import { Prisma } from '@prisma/client';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('productoId');
    const sucursalId = searchParams.get('sucursalId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const dateFilter: { gte?: Date; lte?: Date; gt?: Date } = {};

    if (from || to) {
      if (from) dateFilter.gte = parseBusinessDate(from);
      if (to) dateFilter.lte = parseBusinessDate(to);
    } else if (productoId) {
      // Sin filtro de fecha: buscar la última carga de este producto (en esta sucursal) y partir desde ahí
      const ultimaCarga = await prisma.productoCarga.findFirst({
        where: { productoId, sucursalId: sucursalId ?? undefined },
        orderBy: { businessDate: 'desc' },
      });

      if (ultimaCarga) {
        // Solo movimientos DESPUÉS de la fecha de la última carga
        dateFilter.gt = ultimaCarga.businessDate;
      }
    }

    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const where: Prisma.PurchaseWhereInput = {
      productoId: productoId ?? undefined,
      sucursalId: sucursalId ?? undefined,
      businessDate: hasDateFilter ? dateFilter : undefined,
    };

    const salesWhere: Prisma.SaleWhereInput = {
      productoId: productoId ?? undefined,
      sucursalId: sucursalId ?? undefined,
      businessDate: hasDateFilter ? dateFilter : undefined,
    };

    const [purchases, sales] = await Promise.all([
      prisma.purchase.findMany({ where, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }] }),
      prisma.sale.findMany({ where: salesWhere, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }] }),
    ]);

    // Obtener info de la última carga para incluirla en la respuesta
    let ultimaCargaInfo = null;
    if (productoId) {
      const ultimaCarga = await prisma.productoCarga.findFirst({
        where: { productoId, sucursalId: sucursalId ?? undefined },
        orderBy: { businessDate: 'desc' },
      });
      if (ultimaCarga) {
        ultimaCargaInfo = {
          id: ultimaCarga.id,
          businessDate: toBusinessDateString(ultimaCarga.businessDate),
          libras: ultimaCarga.libras !== null ? Number(ultimaCarga.libras) : null,
          descripcion: ultimaCarga.descripcion,
        };
      }
    }

    const mappedSales = sales.map((s) => ({
      ...s,
      businessDate: toBusinessDateString(s.businessDate),
      precioPorLibra: s.precioPorLibra !== null ? Number(s.precioPorLibra) : null,
      libras: s.libras !== null ? Number(s.libras) : null,
      porcentajeOro: s.porcentajeOro !== null ? Number(s.porcentajeOro) : null,
      quintalesOro: s.quintalesOro !== null ? Number(s.quintalesOro) : null,
      precioPorQuintalOro: s.precioPorQuintalOro !== null ? Number(s.precioPorQuintalOro) : null,
      monto: Number(s.monto),
      createdAt: s.createdAt.toISOString(),
    }));

    if (productoId) {
      // Group by day for the specified producto: stock neto = compras - ventas
      const dailyMap: Record<string, number> = {};
      let totalLibras = 0;

      for (const p of purchases) {
        const day = toBusinessDateString(p.businessDate);
        const libras = Number(p.libras);
        dailyMap[day] = (dailyMap[day] || 0) + libras;
        totalLibras += libras;
      }

      for (const s of sales) {
        if (s.libras === null) continue;
        const day = toBusinessDateString(s.businessDate);
        const libras = Number(s.libras);
        dailyMap[day] = (dailyMap[day] || 0) - libras;
        totalLibras -= libras;
      }

      const daily = Object.keys(dailyMap)
        .sort()
        .map((businessDate) => ({ businessDate, libras: dailyMap[businessDate] }));

      return success({
        filters: { productoId, sucursalId, from, to },
        ultimaCarga: ultimaCargaInfo,
        data: {
          productoId,
          totalLibras,
          daily,
          purchases: purchases.map((p) => ({
            ...p,
            businessDate: toBusinessDateString(p.businessDate),
            precioPorLibra: Number(p.precioPorLibra),
            pesoBruto: p.pesoBruto !== null ? Number(p.pesoBruto) : null,
            numeroSacos: p.numeroSacos,
            taraPorSaco: p.taraPorSaco !== null ? Number(p.taraPorSaco) : null,
            quintalesOro: p.quintalesOro !== null ? Number(p.quintalesOro) : null,
            libras: Number(p.libras),
            total: Number(p.total),
            createdAt: p.createdAt.toISOString(),
          })),
          sales: mappedSales,
        },
      });
    }

    // Aggregate by producto when no productoId provided: stock neto = compras - ventas
    const byProducto: Record<string, { productoId: string; productoNombre: string; totalLibras: number }> = {};
    for (const p of purchases) {
      const key = p.productoId;
      const libras = Number(p.libras);
      if (!byProducto[key]) byProducto[key] = { productoId: p.productoId, productoNombre: p.productoNombre, totalLibras: 0 };
      byProducto[key].totalLibras += libras;
    }
    for (const s of sales) {
      if (s.libras === null || s.productoId === null) continue;
      const libras = Number(s.libras);
      if (!byProducto[s.productoId]) byProducto[s.productoId] = { productoId: s.productoId, productoNombre: s.productoNombre ?? '', totalLibras: 0 };
      byProducto[s.productoId].totalLibras -= libras;
    }

    const productos = Object.values(byProducto).sort((a, b) => b.totalLibras - a.totalLibras);

    return success({
      filters: { sucursalId, from, to },
      data: {
        productos,
        purchases: purchases.map((p) => ({
          ...p,
          businessDate: toBusinessDateString(p.businessDate),
          precioPorLibra: Number(p.precioPorLibra),
          pesoBruto: p.pesoBruto !== null ? Number(p.pesoBruto) : null,
          numeroSacos: p.numeroSacos,
          taraPorSaco: p.taraPorSaco !== null ? Number(p.taraPorSaco) : null,
          quintalesOro: p.quintalesOro !== null ? Number(p.quintalesOro) : null,
          libras: Number(p.libras),
          total: Number(p.total),
          createdAt: p.createdAt.toISOString(),
        })),
        sales: mappedSales,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
