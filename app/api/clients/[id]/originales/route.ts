import { createClienteOriginalSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
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

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const originales = await prisma.clienteOriginal.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    });

    return success(originales.map(mapClienteOriginal));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = createClienteOriginalSchema.parse(await request.json());

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }

    const original = await prisma.clienteOriginal.create({
      data: {
        clientId: id,
        nombres: payload.nombres,
        apellidos: payload.apellidos,
        claveIhcafe: payload.claveIhcafe,
      },
    });

    return success(mapClienteOriginal(original), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
