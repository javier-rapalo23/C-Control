import { updateProductoSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateProductoSchema.parse(await request.json());

    const producto = await prisma.producto.update({
      where: { id },
      data: payload,
    });

    return success({
      ...producto,
      precioPorLibra: Number(producto.precioPorLibra),
      createdAt: producto.createdAt.toISOString(),
      updatedAt: producto.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.producto.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Producto no encontrado', 404);
    }

    await prisma.producto.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
