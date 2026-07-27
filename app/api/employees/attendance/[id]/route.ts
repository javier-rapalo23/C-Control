import { updateAttendanceSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';

type Params = {
  params: Promise<{ id: string }>;
};

function mapAttendance(record: {
  id: string;
  businessDate: Date;
  employeeId: string;
  employeeNombre: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...record,
    businessDate: toBusinessDateString(record.businessDate),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateAttendanceSchema.parse(await request.json());

    const record = await prisma.attendance.update({
      where: { id },
      data: {
        ...(payload.horaEntrada !== undefined ? { horaEntrada: payload.horaEntrada } : {}),
        ...(payload.horaSalida !== undefined ? { horaSalida: payload.horaSalida } : {}),
        ...(payload.notas !== undefined ? { notas: payload.notas } : {}),
      },
    });

    return success(mapAttendance(record));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.attendance.findUnique({ where: { id } });
    if (!existing) {
      return failure('NOT_FOUND', 'Registro no encontrado', 404);
    }

    await prisma.attendance.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
