import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('materialId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: any = {};

    if (materialId) where.materialId = materialId;

    if (from || to) {
      where.businessDate = {};
      if (from) where.businessDate.gte = parseBusinessDate(from);
      if (to) where.businessDate.lte = parseBusinessDate(to);
    } else if (materialId) {
      // Sin filtro de fecha: buscar la última carga de este material y partir desde ahí
      const ultimaCarga = await prisma.materialCarga.findFirst({
        where: { materialId },
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
    if (materialId) {
      const ultimaCarga = await prisma.materialCarga.findFirst({
        where: { materialId },
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

    if (materialId) {
      // Group by day for the specified material
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
        filters: { materialId, from, to },
        ultimaCarga: ultimaCargaInfo,
        data: { materialId, totalLibras, daily, purchases: purchases.map((p) => ({
          ...p,
          businessDate: toBusinessDateString(p.businessDate),
          precioPorLibra: Number(p.precioPorLibra),
          libras: Number(p.libras),
          total: Number(p.total),
          createdAt: p.createdAt.toISOString(),
        })) },
      });
    }

    // Aggregate by material when no materialId provided
    const byMaterial: Record<string, { materialId: string; materialNombre: string; totalLibras: number }> = {};
    for (const p of purchases) {
      const key = p.materialId;
      const libras = Number(p.libras);
      if (!byMaterial[key]) byMaterial[key] = { materialId: p.materialId, materialNombre: p.materialNombre, totalLibras: 0 };
      byMaterial[key].totalLibras += libras;
    }

    const materials = Object.values(byMaterial).sort((a, b) => b.totalLibras - a.totalLibras);

    return success({ filters: { from, to }, data: { materials, purchases: purchases.map((p) => ({
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
