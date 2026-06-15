import { updateMaterialSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateMaterialSchema.parse(await request.json());

    const material = await prisma.material.update({
      where: { id },
      data: payload,
    });

    return success({
      ...material,
      precioPorLibra: Number(material.precioPorLibra),
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Material no encontrado', 404);
    }

    await prisma.material.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
