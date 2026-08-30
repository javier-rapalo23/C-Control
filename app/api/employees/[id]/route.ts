import { updateEmployeeSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

type Params = {
  params: Promise<{ id: string }>;
};

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

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateEmployeeSchema.parse(await request.json());

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(payload.sucursalId !== undefined ? { sucursalId: payload.sucursalId } : {}),
        ...(payload.nombre !== undefined ? { nombre: payload.nombre } : {}),
        ...(payload.puesto !== undefined ? { puesto: payload.puesto } : {}),
        ...(payload.telefono !== undefined ? { telefono: payload.telefono } : {}),
        ...(payload.salarioDiario !== undefined ? { salarioDiario: payload.salarioDiario } : {}),
        ...(payload.fechaIngreso !== undefined
          ? { fechaIngreso: payload.fechaIngreso ? parseBusinessDate(payload.fechaIngreso) : null }
          : {}),
        ...(payload.activo !== undefined ? { activo: payload.activo } : {}),
      },
    });

    return success(mapEmployee(employee));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Empleado no encontrado', 404);
    }

    await prisma.employee.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
