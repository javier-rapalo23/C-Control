import { recalculateDailyBalance } from '@/lib/ledger';
import { CASH_PAYMENT_METHOD } from '@/lib/payment-methods';

type Compra = { total: number; metodoPago?: string };

/**
 * Doble de la parte de Prisma que consume `recalculateDailyBalance`. Fija la
 * ecuación del saldo sin depender de una base de datos: es la única regla que
 * decide con cuánto efectivo cierra el día.
 */
function fakeDb(options: {
  saldoInicial?: number;
  ajusteCaja?: number;
  compras?: Compra[];
  ventas?: number[];
  gastos?: number[];
  ingresos?: number[];
}) {
  const compras = options.compras ?? [];
  const balance = {
    id: 'bal-1',
    businessDate: new Date('2026-08-31T00:00:00.000Z'),
    sucursalId: 'suc-1',
    saldoInicial: options.saldoInicial ?? 0,
    saldoActual: 0,
    ajusteCaja: options.ajusteCaja ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sum = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0));

  return {
    updated: null as { saldoActual: number } | null,
    dailyBalance: {
      upsert: async () => balance,
      update: async ({ data }: { data: { saldoActual: number } }) => ({ ...balance, ...data }),
    },
    purchase: {
      // El filtro por `purchaseTransaction.metodoPago` es lo que distingue el
      // agregado de compras en efectivo del de todas las compras.
      aggregate: async ({ where }: { where: { purchaseTransaction?: { metodoPago: string } } }) => {
        const metodo = where.purchaseTransaction?.metodoPago;
        const seleccion = metodo
          ? compras.filter((compra) => (compra.metodoPago ?? CASH_PAYMENT_METHOD) === metodo)
          : compras;
        return { _sum: { total: sum(seleccion.map((compra) => compra.total)) } };
      },
    },
    sale: { aggregate: async () => ({ _sum: { monto: sum(options.ventas ?? []) } }) },
    expense: { aggregate: async () => ({ _sum: { monto: sum(options.gastos ?? []) } }) },
    cashEntry: { aggregate: async () => ({ _sum: { monto: sum(options.ingresos ?? []) } }) },
  } as never;
}

const FECHA = '2026-08-31';

describe('recalculateDailyBalance', () => {
  it('resta compras, resta gastos y suma ventas', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 1000, compras: [{ total: 400 }], ventas: [500], gastos: [100] }),
      FECHA,
      'suc-1',
    );

    expect(totals.saldoActual).toBe(1000);
    expect(totals.totalCompras).toBe(400);
  });

  it('suma los ingresos de efectivo al saldo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 500, ingresos: [200, 300] }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalIngresos).toBe(500);
    expect(totals.saldoActual).toBe(1000);
  });

  it('no resta del saldo las compras con depósito o cheque', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({
        saldoInicial: 1000,
        compras: [
          { total: 300, metodoPago: 'efectivo' },
          { total: 500, metodoPago: 'deposito' },
          { total: 200, metodoPago: 'cheque' },
        ],
      }),
      FECHA,
      'suc-1',
    );

    // La compra existe completa para inventario y reportes...
    expect(totals.totalCompras).toBe(1000);
    // ...pero solo los 300 en efectivo salieron de la gaveta.
    expect(totals.totalComprasEfectivo).toBe(300);
    expect(totals.totalComprasOtrosMedios).toBe(700);
    expect(totals.saldoActual).toBe(700);
  });

  it('trata como efectivo las compras sin método de pago registrado', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 1000, compras: [{ total: 250 }] }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalComprasEfectivo).toBe(250);
    expect(totals.saldoActual).toBe(750);
  });

  it('incluye el ajuste del arqueo en el saldo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 1000, ajusteCaja: -50, ingresos: [100] }),
      FECHA,
      'suc-1',
    );

    expect(totals.saldoActual).toBe(1050);
  });
});
