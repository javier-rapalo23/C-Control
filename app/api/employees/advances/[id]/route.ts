import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.employeeAdvance.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Anticipo no encontrado', 404);
    }

    await prisma.employeeAdvance.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
