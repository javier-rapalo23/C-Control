import { updateProductoSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { findCoffeeType } from '@/lib/coffee-types';
import { mapProducto } from '@/lib/producto-dto';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateProductoSchema.parse(await request.json());

    // Renombrar solo puede mover el producto a otro tipo del catálogo, y la
    // categoría viaja con el nombre para que no queden desalineados.
    const data: { nombre?: string; categoria?: string; taraPorSaco?: number } = {};
    if (payload.nombre !== undefined) {
      const tipo = findCoffeeType(payload.nombre);
      if (!tipo) {
        return failure('VALIDATION_ERROR', `Tipo de café desconocido: ${payload.nombre}`, 422);
      }
      data.nombre = tipo.nombre;
      data.categoria = tipo.categoria;
    }
    if (payload.taraPorSaco !== undefined) data.taraPorSaco = payload.taraPorSaco;

    const producto = await prisma.producto.update({ where: { id }, data });

    return success(mapProducto(producto));
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
