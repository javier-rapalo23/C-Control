import { handleApiError, success } from '@/lib/api-response';
import { toBusinessDateString } from '@/lib/business-date';
import { prisma } from '@/lib/prisma';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const carga = await prisma.materialCarga.findUnique({ where: { id: params.id } });
    if (!carga) {
      return handleApiError(new Error('Carga no encontrada'));
    }

    await prisma.materialCarga.delete({ where: { id: params.id } });

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
