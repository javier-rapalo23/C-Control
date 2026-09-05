import { updateClientSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

function mapClient(client: {
  id: string;
  nombre: string;
  nombres: string | null;
  apellidos: string | null;
  claveIhcafe: string | null;
  nombreFinca: string | null;
  telefono: string | null;
  direccion: string | null;
  rtn: string | null;
  cuentaBancaria: string | null;
  notas: string | null;
  esGeneral: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...client,
    nombres: client.nombres ?? null,
    apellidos: client.apellidos ?? null,
    claveIhcafe: client.claveIhcafe ?? null,
    nombreFinca: client.nombreFinca ?? null,
    telefono: client.telefono ?? null,
    direccion: client.direccion ?? null,
    rtn: client.rtn ?? null,
    cuentaBancaria: client.cuentaBancaria ?? null,
    notas: client.notas ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateClientSchema.parse(await request.json());

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }

    const nombres = payload.nombres ?? existing.nombres ?? undefined;
    const apellidos = payload.apellidos ?? existing.apellidos ?? undefined;
    const nombre = nombres && apellidos ? `${nombres} ${apellidos}`.trim() : existing.nombre;

    const client = await prisma.client.update({
      where: { id },
      data: { ...payload, nombre },
    });

    return success(mapClient(client));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }
    if (existing.esGeneral) {
      return failure('FORBIDDEN', 'No se puede eliminar el cliente general', 403);
    }

    await prisma.client.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
