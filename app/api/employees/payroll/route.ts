import { confirmPayrollSchema, payrollPreviewSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { confirmPayroll, getPayrollPreview } from '@/lib/payroll';
import { resolveSucursalId } from '@/lib/ledger';
import { prisma } from '@/lib/prisma';
import { endOfBusinessWeek, startOfBusinessWeek, todayBusinessDate } from '@/lib/business-date';

/** Previsualización del cálculo. No escribe nada: es seguro consultarla siempre. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const today = todayBusinessDate();
    const payload = payrollPreviewSchema.parse({
      from: searchParams.get('from') ?? startOfBusinessWeek(today),
      to: searchParams.get('to') ?? endOfBusinessWeek(today),
      ...(searchParams.get('sucursalId') ? { sucursalId: searchParams.get('sucursalId') } : {}),
    });

    const sucursalId = await resolveSucursalId(prisma, payload.sucursalId);
    return success(await getPayrollPreview(prisma, { from: payload.from, to: payload.to, sucursalId }));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Confirma la planilla y desembolsa. Escribe pagos, adelantos y el gasto de caja. */
export async function POST(request: Request) {
  try {
    const payload = confirmPayrollSchema.parse(await request.json());

    const result = await prisma.$transaction(
      async (tx) => {
        const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
        return confirmPayroll(tx, {
          from: payload.from,
          to: payload.to,
          sucursalId,
          // Por defecto se paga el último día del período.
          businessDate: payload.businessDate ?? payload.to,
          employeeIds: payload.employeeIds,
        });
      },
      // Confirmar una planilla son muchas escrituras secuenciales (un pago y sus
      // anticipos por empleado, más el gasto y el recálculo del saldo). Con los
      // 5 s por defecto de Prisma, una planilla con varios empleados sobre una
      // base remota agota el tiempo y aborta a medio camino.
      { timeout: 30_000, maxWait: 10_000 },
    );

    return success(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
