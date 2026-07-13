import { handleApiError, success } from '@/lib/api-response';
import { toBusinessDateString } from '@/lib/business-date';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const carga = await prisma.productoCarga.findUnique({ where: { id } });
    if (!carga) {
      return handleApiError(new Error('Carga no encontrada'));
    }

    await prisma.productoCarga.delete({ where: { id } });

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
