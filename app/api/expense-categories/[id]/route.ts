import { updateExpenseCategorySchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

function mapCategory(category: {
  id: string;
  nombre: string;
  requiereBanco: boolean;
  activo: boolean;
  sistema: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateExpenseCategorySchema.parse(await request.json());

    const existing = await prisma.expenseCategory.findUnique({
      where: { id },
      select: { sistema: true, requiereBanco: true, _count: { select: { expenses: true } } },
    });
    if (!existing) {
      return failure('NOT_FOUND', 'Categoría no encontrada', 404);
    }
    // El código escribe estas categorías por nombre: renombrarlas rompería el
    // módulo que las genera.
    if (existing.sistema) {
      return failure('CONFLICT', 'Esta categoría la administra el sistema y no se puede modificar.', 409);
    }
    // Los gastos ya registrados se validaron con la regla anterior: cambiarla dejaría
    // pagos de banco sin banco, o gastos comunes colgando de un banco.
    if (
      payload.requiereBanco !== undefined &&
      payload.requiereBanco !== existing.requiereBanco &&
      existing._count.expenses > 0
    ) {
      return failure(
        'CONFLICT',
        'Esta categoría ya tiene gastos registrados; no se puede cambiar si lleva banco.',
        409,
      );
    }

    // Renombrar arrastra los gastos ya registrados: la llave foránea de
    // `Expense.categoria` apunta al nombre con ON UPDATE CASCADE.
    const category = await prisma.expenseCategory.update({
      where: { id },
      data: payload,
    });

    return success(mapCategory(category));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.expenseCategory.findUnique({
      where: { id },
      select: { sistema: true, _count: { select: { expenses: true } } },
    });
    if (!existing) {
      return failure('NOT_FOUND', 'Categoría no encontrada', 404);
    }
    if (existing.sistema) {
      return failure('CONFLICT', 'Esta categoría la administra el sistema y no se puede eliminar.', 409);
    }
    // Borrarla dejaría gastos históricos sin categoría. Desactivarla la saca del
    // formulario sin tocar lo ya registrado.
    if (existing._count.expenses > 0) {
      return failure(
        'CONFLICT',
        'Esta categoría ya tiene gastos registrados. Desactívela en vez de eliminarla.',
        409,
      );
    }

    await prisma.expenseCategory.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
