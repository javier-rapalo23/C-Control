import { Prisma } from '@prisma/client';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('productoId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Prisma.PurchaseWhereInput = {};

    if (productoId) where.productoId = productoId;

    if (from || to) {
      where.businessDate = {};
      if (from) where.businessDate.gte = parseBusinessDate(from);
      if (to) where.businessDate.lte = parseBusinessDate(to);
    } else if (productoId) {
      // Sin filtro de fecha: buscar la última carga de este producto y partir desde ahí
      const ultimaCarga = await prisma.productoCarga.findFirst({
        where: { productoId },
        orderBy: { businessDate: 'desc' },
      });

      if (ultimaCarga) {
        // Solo compras DESPUÉS de la fecha de la última carga
        where.businessDate = { gt: ultimaCarga.businessDate };
      }
    }

    const purchases = await prisma.purchase.findMany({ where, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }] });

    // Obtener info de la última carga para incluirla en la respuesta
    let ultimaCargaInfo = null;
    if (productoId) {
      const ultimaCarga = await prisma.productoCarga.findFirst({
        where: { productoId },
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

    if (productoId) {
      // Group by day for the specified producto
      const dailyMap: Record<string, number> = {};
      let totalLibras = 0;

      for (const p of purchases) {
        const day = toBusinessDateString(p.businessDate);
        const libras = Number(p.libras);
        dailyMap[day] = (dailyMap[day] || 0) + libras;
        totalLibras += libras;
      }

      const daily = Object.keys(dailyMap)
        .sort()
        .map((businessDate) => ({ businessDate, libras: dailyMap[businessDate] }));

      return success({
        filters: { productoId, from, to },
        ultimaCarga: ultimaCargaInfo,
        data: { productoId, totalLibras, daily, purchases: purchases.map((p) => ({
          ...p,
          businessDate: toBusinessDateString(p.businessDate),
          precioPorLibra: Number(p.precioPorLibra),
          libras: Number(p.libras),
          total: Number(p.total),
          createdAt: p.createdAt.toISOString(),
        })) },
      });
    }

    // Aggregate by producto when no productoId provided
    const byProducto: Record<string, { productoId: string; productoNombre: string; totalLibras: number }> = {};
    for (const p of purchases) {
      const key = p.productoId;
      const libras = Number(p.libras);
      if (!byProducto[key]) byProducto[key] = { productoId: p.productoId, productoNombre: p.productoNombre, totalLibras: 0 };
      byProducto[key].totalLibras += libras;
    }

    const productos = Object.values(byProducto).sort((a, b) => b.totalLibras - a.totalLibras);

    return success({ filters: { from, to }, data: { productos, purchases: purchases.map((p) => ({
      ...p,
      businessDate: toBusinessDateString(p.businessDate),
      precioPorLibra: Number(p.precioPorLibra),
      libras: Number(p.libras),
      total: Number(p.total),
      createdAt: p.createdAt.toISOString(),
    })) } });
  } catch (error) {
    return handleApiError(error);
  }
}
