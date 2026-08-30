import { Prisma } from '@prisma/client';
import { createEmployeeAdvanceSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { PAYROLL_EXPENSE_CATEGORY } from '@/lib/payroll';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';

function mapAdvance(advance: {
  id: string;
  businessDate: Date;
  employeeId: string;
  employeeNombre: string;
  monto: Prisma.Decimal;
  montoAplicado: Prisma.Decimal;
  motivo: string | null;
  createdAt: Date;
}) {
  const monto = Number(advance.monto);
  const montoAplicado = Number(advance.montoAplicado);

  return {
    id: advance.id,
    businessDate: toBusinessDateString(advance.businessDate),
    employeeId: advance.employeeId,
    employeeNombre: advance.employeeNombre,
    monto,
    montoAplicado,
    /** Lo que aún falta descontar en planillas futuras. */
    pendiente: Number((monto - montoAplicado).toFixed(2)),
    motivo: advance.motivo,
    createdAt: advance.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const sucursalId = searchParams.get('sucursalId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Prisma.EmployeeAdvanceWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    // Se filtra por la sucursal a la que pertenece el empleado, que es lo que
    // pregunta el panel, y no por la sucursal desde la que salió el efectivo.
    if (sucursalId) where.employee = { sucursalId };
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

    const advance = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: payload.employeeId } });
      if (!employee) {
        throw new Error('Empleado no encontrado');
      }

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      // El adelanto es efectivo que sale hoy: genera su gasto igual que un pago.
      // Al descontarse luego en la planilla, esa planilla paga el neto, de modo
      // que el dinero se registra una sola vez.
      const expense = await tx.expense.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          categoria: PAYROLL_EXPENSE_CATEGORY,
          descripcion: `Anticipo — ${employee.nombre}${payload.motivo ? ` (${payload.motivo})` : ''}`,
          monto: payload.monto,
        },
      });

      const created = await tx.employeeAdvance.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          employeeId: employee.id,
          employeeNombre: employee.nombre,
          monto: payload.monto,
          motivo: payload.motivo ?? null,
          sucursalId,
          expenseId: expense.id,
        },
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    return success(mapAdvance(advance), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
