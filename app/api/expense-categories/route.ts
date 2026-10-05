import { createExpenseCategorySchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

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

export async function GET() {
  try {
    const categories = await prisma.expenseCategory.findMany({ orderBy: { nombre: 'asc' } });
    return success(categories.map(mapCategory));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createExpenseCategorySchema.parse(await request.json());
    const category = await prisma.expenseCategory.create({
      data: {
        nombre: payload.nombre,
        requiereBanco: payload.requiereBanco ?? false,
        activo: payload.activo ?? true,
      },
    });

    return success(mapCategory(category), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
