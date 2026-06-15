import { createUserSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

function formatUser(u: { id: string; userId: string; nombre: string; role: string; activo: boolean; createdAt: Date; updatedAt: Date }) {
  return { ...u, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return success(users.map(formatUser));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createUserSchema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        userId: payload.userId,
        nombre: payload.nombre ?? '',
        password: payload.password,
        role: payload.role,
      },
    });
    return success(formatUser(user), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
