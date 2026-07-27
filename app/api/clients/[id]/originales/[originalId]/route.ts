import { updateClienteOriginalSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string; originalId: string }>;
};

function mapClienteOriginal(entry: {
  id: string;
  clientId: string;
  nombres: string;
  apellidos: string;
  claveIhcafe: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { originalId } = await params;
    const payload = updateClienteOriginalSchema.parse(await request.json());

    const existing = await prisma.clienteOriginal.findUnique({ where: { id: originalId } });
    if (!existing) {
      return failure('NOT_FOUND', 'Cliente original no encontrado', 404);
    }

    const original = await prisma.clienteOriginal.update({
      where: { id: originalId },
      data: payload,
    });

    return success(mapClienteOriginal(original));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { originalId } = await params;

    const existing = await prisma.clienteOriginal.findUnique({ where: { id: originalId } });
    if (!existing) {
      return failure('NOT_FOUND', 'Cliente original no encontrado', 404);
    }

    await prisma.clienteOriginal.delete({ where: { id: originalId } });
    return success({ deleted: true, id: originalId });
  } catch (error) {
    return handleApiError(error);
  }
}
