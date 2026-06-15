import { updateUserSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

function formatUser(u: { id: string; userId: string; nombre: string; role: string; activo: boolean; createdAt: Date; updatedAt: Date }) {
  return { ...u, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateUserSchema.parse(await request.json());
    const user = await prisma.user.update({ where: { id }, data: payload });
    return success(formatUser(user));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return failure('NOT_FOUND', 'Usuario no encontrado', 404);
    await prisma.user.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
