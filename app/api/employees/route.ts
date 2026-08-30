import { createEmployeeSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

function mapEmployee(employee: {
  id: string;
  sucursalId: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  salarioDiario: unknown;
  fechaIngreso: Date | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...employee,
    salarioDiario: employee.salarioDiario !== null ? Number(employee.salarioDiario) : null,
    fechaIngreso: employee.fechaIngreso ? toBusinessDateString(employee.fechaIngreso) : null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sucursalId = searchParams.get('sucursalId');

    const employees = await prisma.employee.findMany({
      // Sin `sucursalId` devuelve todas las sucursales: útil para un listado global.
      // Los paneles siempre lo envían, porque el personal se gestiona por sucursal.
      where: sucursalId ? { sucursalId } : {},
      orderBy: { createdAt: 'desc' },
    });

    return success(employees.map(mapEmployee));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createEmployeeSchema.parse(await request.json());
    const sucursalId = await resolveSucursalId(prisma, payload.sucursalId);

    const employee = await prisma.employee.create({
      data: {
        sucursalId,
        nombre: payload.nombre,
        puesto: payload.puesto ?? null,
        telefono: payload.telefono ?? null,
        salarioDiario: payload.salarioDiario ?? null,
        fechaIngreso: payload.fechaIngreso ? parseBusinessDate(payload.fechaIngreso) : null,
        activo: payload.activo ?? true,
      },
    });

    return success(mapEmployee(employee), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
