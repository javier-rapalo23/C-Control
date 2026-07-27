import { Prisma } from '@prisma/client';
import { createEmployeeAdvanceSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

function mapAdvance(advance: {
  id: string;
  businessDate: Date;
  employeeId: string;
  employeeNombre: string;
  monto: Prisma.Decimal;
  motivo: string | null;
  createdAt: Date;
}) {
  return {
    ...advance,
    businessDate: toBusinessDateString(advance.businessDate),
    monto: Number(advance.monto),
    createdAt: advance.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Prisma.EmployeeAdvanceWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.businessDate = {};
      if (from) where.businessDate.gte = parseBusinessDate(from);
      if (to) where.businessDate.lte = parseBusinessDate(to);
    }

    const advances = await prisma.employeeAdvance.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    return success(advances.map(mapAdvance));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createEmployeeAdvanceSchema.parse(await request.json());

    const employee = await prisma.employee.findUnique({ where: { id: payload.employeeId } });
    if (!employee) {
      throw new Error('Empleado no encontrado');
    }

    const advance = await prisma.employeeAdvance.create({
      data: {
        businessDate: parseBusinessDate(payload.businessDate),
        employeeId: employee.id,
        employeeNombre: employee.nombre,
        monto: payload.monto,
        motivo: payload.motivo ?? null,
      },
    });

    return success(mapAdvance(advance), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
