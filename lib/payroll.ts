import { Prisma, PrismaClient } from '@prisma/client';
import { formatBusinessRange, parseBusinessDate } from '@/lib/business-date';
import { decimalToNumber, recalculateDailyBalance } from '@/lib/ledger';
import { assertCashOpen } from '@/lib/cash-session';
import type { PayrollLineDTO, PayrollPreviewDTO } from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Categoría de los gastos que genera la planilla; permite reconocerlos después. */
export const PAYROLL_EXPENSE_CATEGORY = 'Planilla';

const round = (value: number): number => Number(value.toFixed(2));

/**
 * Calcula la planilla del período sin escribir nada.
 *
 * Reglas (§18.3):
 * - **Base**: `salarioDiario × días con asistencia registrada` en el período.
 *   Un día cuenta por tener registro, no por las horas trabajadas.
 * - **Adelantos**: se descuentan los del período y también los pendientes de
 *   períodos anteriores, en orden de antigüedad.
 * - Un adelanto puede aplicarse **parcialmente** y arrastrar el resto a la
 *   siguiente semana, para que uno grande no bloquee el pago ni se pierda.
 * - El neto nunca es negativo.
 */
export async function getPayrollPreview(
  db: DbClient,
  input: { from: string; to: string; sucursalId: string },
): Promise<PayrollPreviewDTO> {
  const { from, to, sucursalId } = input;
  if (from > to) {
    throw new Error('El rango de fechas está invertido: "from" debe ser anterior o igual a "to".');
  }

  const fromDate = parseBusinessDate(from);
  const toDate = parseBusinessDate(to);

  const employees = await db.employee.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });

  const [attendance, advances, existingPayments] = await Promise.all([
    db.attendance.groupBy({
      by: ['employeeId'],
      where: { businessDate: { gte: fromDate, lte: toDate } },
      _count: { _all: true },
    }),
    // Se incluyen los adelantos anteriores al período que sigan sin liquidar: de
    // lo contrario un adelanto no descontado quedaría olvidado para siempre.
    db.employeeAdvance.findMany({
      where: { businessDate: { lte: toDate } },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    }),
    db.employeePayment.findMany({
      where: { tipo: 'planilla', periodoInicio: fromDate, periodoFin: toDate },
      select: { employeeId: true },
    }),
  ]);

  const diasPorEmpleado = new Map(attendance.map((row) => [row.employeeId, row._count._all]));
  const yaPagados = new Set(existingPayments.map((payment) => payment.employeeId));

  const pendientesPorEmpleado = new Map<string, number>();
  for (const advance of advances) {
    const pendiente = decimalToNumber(advance.monto) - decimalToNumber(advance.montoAplicado);
    if (pendiente <= 0) continue;
    pendientesPorEmpleado.set(advance.employeeId, (pendientesPorEmpleado.get(advance.employeeId) ?? 0) + pendiente);
  }

  const lines: PayrollLineDTO[] = employees.map((employee) => {
    const salarioDiario = employee.salarioDiario !== null ? decimalToNumber(employee.salarioDiario) : null;
    const diasTrabajados = diasPorEmpleado.get(employee.id) ?? 0;
    const subtotal = round((salarioDiario ?? 0) * diasTrabajados);
    const adelantosPendientes = round(pendientesPorEmpleado.get(employee.id) ?? 0);
    const adelantosAplicados = round(Math.min(subtotal, adelantosPendientes));

    let advertencia: string | null = null;
    if (salarioDiario === null) {
      advertencia = 'Sin salario diario configurado.';
    } else if (diasTrabajados === 0) {
      advertencia = 'Sin asistencia registrada en el período.';
    } else if (adelantosPendientes > subtotal) {
      advertencia = 'Los adelantos superan el pago; el resto queda pendiente para la próxima planilla.';
    }

    return {
      employeeId: employee.id,
      employeeNombre: employee.nombre,
      salarioDiario,
      diasTrabajados,
      subtotal,
      adelantosPendientes,
      adelantosAplicados,
      neto: round(subtotal - adelantosAplicados),
      adelantoRemanente: round(adelantosPendientes - adelantosAplicados),
      yaPagado: yaPagados.has(employee.id),
      advertencia,
    };
  });

  const pagables = lines.filter((line) => !line.yaPagado);

  return {
    from,
    to,
    label: formatBusinessRange(from, to),
    sucursalId,
    lines,
    totals: {
      subtotal: round(pagables.reduce((sum, line) => sum + line.subtotal, 0)),
      adelantosAplicados: round(pagables.reduce((sum, line) => sum + line.adelantosAplicados, 0)),
      neto: round(pagables.reduce((sum, line) => sum + line.neto, 0)),
      empleados: pagables.filter((line) => line.subtotal > 0).length,
    },
  };
}

/**
 * Confirma la planilla: crea los pagos, marca los adelantos aplicados y registra
 * el gasto que descuenta el efectivo de la caja.
 *
 * Debe invocarse dentro de una transacción. Es idempotente por período: un
 * empleado ya pagado en ese rango se rechaza en vez de pagarse dos veces.
 */
export async function confirmPayroll(
  db: DbClient,
  input: {
    from: string;
    to: string;
    sucursalId: string;
    businessDate: string;
    employeeIds: string[];
  },
) {
  const { from, to, sucursalId, businessDate, employeeIds } = input;

  await assertCashOpen(db, businessDate, sucursalId);

  const preview = await getPayrollPreview(db, { from, to, sucursalId });
  const seleccionadas = preview.lines.filter((line) => employeeIds.includes(line.employeeId));

  if (seleccionadas.length === 0) {
    throw new Error('Ningún empleado seleccionado corresponde al período.');
  }

  const yaPagado = seleccionadas.find((line) => line.yaPagado);
  if (yaPagado) {
    throw new Error(`${yaPagado.employeeNombre} ya tiene una planilla registrada para ${preview.label}.`);
  }

  const sinMonto = seleccionadas.find((line) => line.subtotal <= 0);
  if (sinMonto) {
    throw new Error(`${sinMonto.employeeNombre} no tiene monto a pagar: ${sinMonto.advertencia ?? 'subtotal en cero'}.`);
  }

  const fechaPago = parseBusinessDate(businessDate);
  const periodoInicio = parseBusinessDate(from);
  const periodoFin = parseBusinessDate(to);
  const creados: Array<{ id: string; monto: Prisma.Decimal }> = [];

  for (const line of seleccionadas) {
    const payment = await db.employeePayment.create({
      data: {
        businessDate: fechaPago,
        employeeId: line.employeeId,
        employeeNombre: line.employeeNombre,
        concepto: `Planilla ${preview.label}`,
        monto: line.neto,
        tipo: 'planilla',
        periodoInicio,
        periodoFin,
        diasTrabajados: line.diasTrabajados,
        salarioDiario: line.salarioDiario,
        subtotal: line.subtotal,
        adelantosAplicados: line.adelantosAplicados,
        sucursalId,
      },
    });

    // Los adelantos se liquidan por antigüedad admitiendo aplicación parcial:
    // `montoAplicado` es lo que impide descontar dos veces el mismo dinero.
    let restante = line.adelantosAplicados;
    if (restante > 0) {
      const pendientes = await db.employeeAdvance.findMany({
        where: { employeeId: line.employeeId, businessDate: { lte: periodoFin } },
        orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
      });

      for (const advance of pendientes) {
        if (restante <= 0) break;
        const pendiente = decimalToNumber(advance.monto) - decimalToNumber(advance.montoAplicado);
        if (pendiente <= 0) continue;

        const aplicar = Math.min(pendiente, restante);
        await db.employeeAdvance.update({
          where: { id: advance.id },
          data: { montoAplicado: round(decimalToNumber(advance.montoAplicado) + aplicar) },
        });
        // Se deja constancia de cuánto aportó *esta* planilla, que es lo que hay
        // que devolver si el pago se borra.
        await db.payrollAdvanceApplication.create({
          data: { paymentId: payment.id, advanceId: advance.id, monto: aplicar },
        });
        restante = round(restante - aplicar);
      }
    }

    creados.push(payment);
  }

  // Un único gasto por la planilla completa: es un solo desembolso de caja, y así
  // el panel de gastos no se llena con una línea por empleado.
  const totalNeto = round(creados.reduce((sum, payment) => sum + decimalToNumber(payment.monto), 0));
  if (totalNeto > 0) {
    const expense = await db.expense.create({
      data: {
        businessDate: fechaPago,
        sucursalId,
        categoria: PAYROLL_EXPENSE_CATEGORY,
        descripcion: `Planilla ${preview.label} — ${creados.length} empleado(s)`,
        monto: totalNeto,
      },
    });

    // El gasto se ancla al primer pago del lote; borrar ese pago arrastra el gasto.
    await db.employeePayment.update({ where: { id: creados[0].id }, data: { expenseId: expense.id } });
    await recalculateDailyBalance(db, businessDate, sucursalId);
  }

  return { pagos: creados.length, totalNeto, label: preview.label };
}
