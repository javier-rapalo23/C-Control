import { Prisma } from '@prisma/client';
import { createAttendanceSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const sucursalId = searchParams.get('sucursalId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Prisma.AttendanceWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (sucursalId) where.employee = { sucursalId };
    if (from || to) {
      where.businessDate = {};
      if (from) where.businessDate.gte = parseBusinessDate(from);
      if (to) where.businessDate.lte = parseBusinessDate(to);
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { employeeNombre: 'asc' }],
    });

    return success(records.map(mapAttendance));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createAttendanceSchema.parse(await request.json());

    const employee = await prisma.employee.findUnique({ where: { id: payload.employeeId } });
    if (!employee) {
      throw new Error('Empleado no encontrado');
    }

    const businessDate = parseBusinessDate(payload.businessDate);

    const record = await prisma.attendance.upsert({
      where: { businessDate_employeeId: { businessDate, employeeId: employee.id } },
      update: {
        ...(payload.horaEntrada !== undefined ? { horaEntrada: payload.horaEntrada } : {}),
        ...(payload.horaSalida !== undefined ? { horaSalida: payload.horaSalida } : {}),
        ...(payload.notas !== undefined ? { notas: payload.notas } : {}),
      },
      create: {
        businessDate,
        employeeId: employee.id,
        employeeNombre: employee.nombre,
        horaEntrada: payload.horaEntrada ?? null,
        horaSalida: payload.horaSalida ?? null,
        notas: payload.notas ?? null,
      },
    });

    return success(mapAttendance(record), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
