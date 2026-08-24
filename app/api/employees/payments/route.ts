import { Prisma } from '@prisma/client';
import { createEmployeePaymentSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { PAYROLL_EXPENSE_CATEGORY } from '@/lib/payroll';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

function mapPayment(payment: {
  id: string;
  businessDate: Date;
  employeeId: string;
  employeeNombre: string;
  concepto: string;
  monto: Prisma.Decimal;
  tipo: string;
  diasTrabajados: number | null;
  periodoInicio: Date | null;
  periodoFin: Date | null;
  adelantosAplicados: Prisma.Decimal | null;
  createdAt: Date;
}) {
  return {
    id: payment.id,
    businessDate: toBusinessDateString(payment.businessDate),
    employeeId: payment.employeeId,
    employeeNombre: payment.employeeNombre,
    concepto: payment.concepto,
    monto: Number(payment.monto),
    tipo: payment.tipo,
    diasTrabajados: payment.diasTrabajados,
    periodoInicio: payment.periodoInicio ? toBusinessDateString(payment.periodoInicio) : null,
    periodoFin: payment.periodoFin ? toBusinessDateString(payment.periodoFin) : null,
    adelantosAplicados: payment.adelantosAplicados !== null ? Number(payment.adelantosAplicados) : null,
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

    const payment = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: payload.employeeId } });
      if (!employee) {
        throw new Error('Empleado no encontrado');
      }

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      // El pago sale de la caja, así que genera su gasto (§18, decisión A). Sin
      // esto el saldo mostrado quedaría por encima del efectivo real.
      const expense = await tx.expense.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          categoria: PAYROLL_EXPENSE_CATEGORY,
          descripcion: `${payload.concepto} — ${employee.nombre}`,
          monto: payload.monto,
        },
      });

      const created = await tx.employeePayment.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          employeeId: employee.id,
          employeeNombre: employee.nombre,
          concepto: payload.concepto,
          monto: payload.monto,
          tipo: 'manual',
          sucursalId,
          expenseId: expense.id,
        },
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    return success(mapPayment(payment), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
