import { createBancoSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

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

export async function GET() {
  try {
    const bancos = await prisma.banco.findMany({ orderBy: { nombre: 'asc' } });
    return success(bancos.map(mapBanco));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createBancoSchema.parse(await request.json());
    const banco = await prisma.banco.create({
      data: {
        nombre: payload.nombre,
        activo: payload.activo ?? true,
      },
    });

    return success(mapBanco(banco), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
