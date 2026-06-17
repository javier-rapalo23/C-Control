import { handleApiError, success } from '@/lib/api-response';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('materialId');

    const where: any = {};
    if (materialId) where.materialId = materialId;

    const cargas = await prisma.materialCarga.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    return success({
      data: cargas.map((c) => ({
        ...c,
        businessDate: toBusinessDateString(c.businessDate),
        libras: c.libras !== null ? Number(c.libras) : null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessDate, materialId, libras, descripcion } = body;

    if (!businessDate || !materialId) {
      return handleApiError(new Error('businessDate y materialId son requeridos'));
    }

    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) {
      return handleApiError(new Error('Material no encontrado'));
    }

    const carga = await prisma.materialCarga.create({
      data: {
        businessDate: parseBusinessDate(businessDate),
        materialId,
        materialNombre: material.nombre,
        libras: libras !== undefined && libras !== null ? libras : null,
        descripcion: descripcion ?? null,
      },
    });

    return success({
      data: {
        ...carga,
        businessDate: toBusinessDateString(carga.businessDate),
        libras: carga.libras !== null ? Number(carga.libras) : null,
        createdAt: carga.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
