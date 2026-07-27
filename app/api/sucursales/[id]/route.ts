import { updateSucursalSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

function mapSucursal(sucursal: {
  id: string;
  nombre: string;
  direccion: string | null;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...sucursal,
    direccion: sucursal.direccion ?? null,
    createdAt: sucursal.createdAt.toISOString(),
    updatedAt: sucursal.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateSucursalSchema.parse(await request.json());

    const sucursal = await prisma.sucursal.update({
      where: { id },
      data: payload,
    });

    return success(mapSucursal(sucursal));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.sucursal.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Sucursal no encontrada', 404);
    }
    if (existing.esPrincipal) {
      return failure('FORBIDDEN', 'No se puede eliminar la sucursal principal', 403);
    }

    await prisma.sucursal.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
