import { getPayrollPreview } from '@/lib/payroll';

type Employee = { id: string; nombre: string; salarioDiario: number | null };
type Advance = { employeeId: string; monto: number; montoAplicado: number };

/**
 * Doble de la parte de Prisma que consume `getPayrollPreview`. Permite fijar las
 * reglas de dinero sin depender de una base de datos.
 */
function fakeDb(options: {
  employees: Employee[];
  dias?: Record<string, number>;
  advances?: Advance[];
  pagados?: string[];
}) {
  return {
    employee: { findMany: async () => options.employees },
    attendance: {
      groupBy: async () =>
        Object.entries(options.dias ?? {}).map(([employeeId, count]) => ({
          employeeId,
          _count: { _all: count },
        })),
    },
    employeeAdvance: { findMany: async () => options.advances ?? [] },
    employeePayment: {
      findMany: async () => (options.pagados ?? []).map((employeeId) => ({ employeeId })),
    },
  } as never;
}

const SEMANA = { from: '2026-08-16', to: '2026-08-22', sucursalId: 'suc-1' };

describe('getPayrollPreview', () => {
  it('calcula salario diario × días con asistencia', async () => {
    const preview = await getPayrollPreview(
      fakeDb({ employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: 300 }], dias: { e1: 5 } }),
      SEMANA,
    );

    expect(preview.lines[0]).toMatchObject({ diasTrabajados: 5, subtotal: 1500, neto: 1500 });
    expect(preview.label).toBe('16 – 22 ago 2026');
  });

  it('descuenta los anticipos pendientes del neto', async () => {
    const preview = await getPayrollPreview(
      fakeDb({
        employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: 300 }],
        dias: { e1: 5 },
        advances: [{ employeeId: 'e1', monto: 500, montoAplicado: 0 }],
      }),
      SEMANA,
    );

    expect(preview.lines[0]).toMatchObject({ subtotal: 1500, adelantosAplicados: 500, neto: 1000 });
  });

  it('ignora la parte del anticipo ya aplicada en semanas anteriores', async () => {
    const preview = await getPayrollPreview(
      fakeDb({
        employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: 300 }],
        dias: { e1: 2 },
        advances: [{ employeeId: 'e1', monto: 500, montoAplicado: 300 }],
      }),
      SEMANA,
    );

    // Solo quedan 200 pendientes: 600 − 200 = 400.
    expect(preview.lines[0]).toMatchObject({ adelantosPendientes: 200, adelantosAplicados: 200, neto: 400 });
  });

  it('nunca deja el neto en negativo y arrastra el resto del anticipo', async () => {
    const preview = await getPayrollPreview(
      fakeDb({
        employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: 100 }],
        dias: { e1: 2 },
        advances: [{ employeeId: 'e1', monto: 900, montoAplicado: 0 }],
      }),
      SEMANA,
    );

    expect(preview.lines[0]).toMatchObject({
      subtotal: 200,
      adelantosAplicados: 200,
      neto: 0,
      adelantoRemanente: 700,
    });
    expect(preview.lines[0].advertencia).toMatch(/superan el pago/);
  });

  it('advierte y no paga a quien no tiene salario diario configurado', async () => {
    const preview = await getPayrollPreview(
      fakeDb({ employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: null }], dias: { e1: 5 } }),
      SEMANA,
    );

    expect(preview.lines[0]).toMatchObject({ subtotal: 0, neto: 0 });
    expect(preview.lines[0].advertencia).toMatch(/Sin salario diario/);
  });

  it('advierte cuando no hay asistencia registrada', async () => {
    const preview = await getPayrollPreview(
      fakeDb({ employees: [{ id: 'e1', nombre: 'Ana', salarioDiario: 300 }] }),
      SEMANA,
    );

    expect(preview.lines[0]).toMatchObject({ diasTrabajados: 0, subtotal: 0 });
    expect(preview.lines[0].advertencia).toMatch(/Sin asistencia/);
  });

  it('marca a quien ya tiene planilla del período y lo excluye de los totales', async () => {
    const preview = await getPayrollPreview(
      fakeDb({
        employees: [
          { id: 'e1', nombre: 'Ana', salarioDiario: 300 },
          { id: 'e2', nombre: 'Beto', salarioDiario: 200 },
        ],
        dias: { e1: 5, e2: 5 },
        pagados: ['e1'],
      }),
      SEMANA,
    );

    expect(preview.lines.find((line) => line.employeeId === 'e1')?.yaPagado).toBe(true);
    // Solo Beto suma: 200 × 5.
    expect(preview.totals).toMatchObject({ subtotal: 1000, neto: 1000, empleados: 1 });
  });

  it('rechaza un rango invertido', async () => {
    await expect(
      getPayrollPreview(fakeDb({ employees: [] }), { from: '2026-08-22', to: '2026-08-16', sucursalId: 'suc-1' }),
    ).rejects.toThrow(/invertido/);
  });
});
