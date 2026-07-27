import { createSucursalSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { getDefaultSucursalId } from '@/lib/ledger';

function mapSucursal(sucursal: {
  id: string;
  nombre: string;
  direccion: string | null;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...sucursal,
    direccion: sucursal.direccion ?? null,
    createdAt: sucursal.createdAt.toISOString(),
    updatedAt: sucursal.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    await getDefaultSucursalId(prisma);
    const sucursales = await prisma.sucursal.findMany({
      orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }],
    });

    return success(sucursales.map(mapSucursal));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createSucursalSchema.parse(await request.json());
    const sucursal = await prisma.sucursal.create({
      data: {
        nombre: payload.nombre,
        direccion: payload.direccion,
        activo: payload.activo ?? true,
      },
    });

    return success(mapSucursal(sucursal), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
