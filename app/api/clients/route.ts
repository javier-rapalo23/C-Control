import { createClientSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

async function ensureGeneralClient() {
  const existing = await prisma.client.findFirst({ where: { esGeneral: true } });
  if (existing) {
    return existing;
  }

  return prisma.client.create({
    data: {
      nombre: 'General',
      esGeneral: true,
    },
  });
}

export async function GET() {
  try {
    await ensureGeneralClient();
    const clients = await prisma.client.findMany({
      orderBy: [{ esGeneral: 'desc' }, { createdAt: 'asc' }],
    });

    return success(
      clients.map((client) => ({
        ...client,
        telefono: client.telefono ?? null,
        direccion: client.direccion ?? null,
        rtn: client.rtn ?? null,
        cuentaBancaria: client.cuentaBancaria ?? null,
        notas: client.notas ?? null,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createClientSchema.parse(await request.json());
    const client = await prisma.client.create({
      data: {
        nombre: payload.nombre,
        telefono: payload.telefono,
        direccion: payload.direccion,
        rtn: payload.rtn,
        cuentaBancaria: payload.cuentaBancaria,
        notas: payload.notas,
      },
    });

    return success(
      {
        ...client,
        telefono: client.telefono ?? null,
        direccion: client.direccion ?? null,
        rtn: client.rtn ?? null,
        cuentaBancaria: client.cuentaBancaria ?? null,
        notas: client.notas ?? null,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}