import { updateBancoSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

function mapBanco(banco: {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...banco,
    createdAt: banco.createdAt.toISOString(),
    updatedAt: banco.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateBancoSchema.parse(await request.json());

    const banco = await prisma.banco.update({
      where: { id },
      data: payload,
    });

    return success(mapBanco(banco));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.banco.findUnique({
      where: { id },
      select: { id: true, _count: { select: { expenses: true } } },
    });
    if (!existing) {
      return failure('NOT_FOUND', 'Banco no encontrado', 404);
    }
    // Borrarlo dejaría los pagos históricos sin banco y rompería el desglose del
    // reporte. Desactivarlo lo saca del formulario sin tocar lo ya registrado.
    if (existing._count.expenses > 0) {
      return failure(
        'CONFLICT',
        'Este banco ya tiene pagos registrados. Desactívelo en vez de eliminarlo.',
        409,
      );
    }

    await prisma.banco.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
