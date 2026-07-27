import { Prisma } from '@prisma/client';
import { createEmployeePaymentSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

function mapPayment(payment: {
  id: string;
  businessDate: Date;
  employeeId: string;
  employeeNombre: string;
  concepto: string;
  monto: Prisma.Decimal;
  createdAt: Date;
}) {
  return {
    ...payment,
    businessDate: toBusinessDateString(payment.businessDate),
    monto: Number(payment.monto),
    createdAt: payment.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Prisma.EmployeePaymentWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.businessDate = {};
      if (from) where.businessDate.gte = parseBusinessDate(from);
      if (to) where.businessDate.lte = parseBusinessDate(to);
    }

    const payments = await prisma.employeePayment.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    return success(payments.map(mapPayment));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createEmployeePaymentSchema.parse(await request.json());

    const employee = await prisma.employee.findUnique({ where: { id: payload.employeeId } });
    if (!employee) {
      throw new Error('Empleado no encontrado');
    }

    const payment = await prisma.employeePayment.create({
      data: {
        businessDate: parseBusinessDate(payload.businessDate),
        employeeId: employee.id,
        employeeNombre: employee.nombre,
        concepto: payload.concepto,
        monto: payload.monto,
      },
    });

    return success(mapPayment(payment), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
