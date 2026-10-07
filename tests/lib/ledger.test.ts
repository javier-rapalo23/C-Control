import { recalculateDailyBalance } from '@/lib/ledger';
import { CASH_PAYMENT_METHOD } from '@/lib/payment-methods';

type Compra = { total: number; metodoPago?: string };
/** Una venta: el monto solo, o con su forma de cobro. Sin forma, cuenta como efectivo. */
type Venta = number | { total: number; metodoPago: string };

/**
 * Doble de la parte de Prisma que consume `recalculateDailyBalance`. Fija la
 * ecuación del saldo sin depender de una base de datos: es la única regla que
 * decide con cuánto efectivo cierra el día.
 */
function fakeDb(options: {
  saldoInicial?: number;
  ajusteCaja?: number;
  compras?: Compra[];
  ventas?: Venta[];
  gastos?: number[];
  ingresos?: number[];
  salidas?: number[];
  molido?: number[];
  /** Compras de otros días liquidadas hoy en efectivo. */
  pagosPendientes?: number[];
  trasladosRecibidos?: number[];
  trasladosEnviados?: number[];
  /** Abonos de clientes a ventas a crédito, recibidos hoy en efectivo. */
  cobros?: number[];
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
    purchaseTransaction: {
      // El desglose por forma de pago sale de un `groupBy` sobre la cabecera: de
      // ahí se saca tanto el total del día como la parte que restó de la gaveta.
      // Una compra sin método registrado cuenta como efectivo.
      groupBy: async () => {
        const porMetodo = new Map<string, number>();
        for (const compra of compras) {
          const metodo = compra.metodoPago ?? CASH_PAYMENT_METHOD;
          porMetodo.set(metodo, (porMetodo.get(metodo) ?? 0) + compra.total);
        }
        return [...porMetodo].map(([metodoPago, total]) => ({ metodoPago, _sum: { total } }));
      },
      // La otra consulta a la cabecera: pendientes de otros días pagadas hoy.
      aggregate: async () => ({ _sum: { total: sum(options.pagosPendientes ?? []) } }),
    },
    // Las ventas también se agrupan por forma de cobro sobre la cabecera.
    saleTransaction: {
      groupBy: async () => {
        const porMetodo = new Map<string, number>();
        for (const venta of options.ventas ?? []) {
          const { total, metodoPago } = typeof venta === 'number' ? { total: venta, metodoPago: CASH_PAYMENT_METHOD } : venta;
          porMetodo.set(metodoPago, (porMetodo.get(metodoPago) ?? 0) + total);
        }
        return [...porMetodo].map(([metodoPago, total]) => ({ metodoPago, _sum: { total } }));
      },
    },
    // Abonos de clientes en efectivo recibidos hoy (la consulta ya filtra por efectivo).
    clientPayment: { aggregate: async () => ({ _sum: { monto: sum(options.cobros ?? []) } }) },
    expense: { aggregate: async () => ({ _sum: { monto: sum(options.gastos ?? []) } }) },
    cashEntry: { aggregate: async () => ({ _sum: { monto: sum(options.ingresos ?? []) } }) },
    grindingService: { aggregate: async () => ({ _sum: { monto: sum(options.molido ?? []) } }) },
    cashWithdrawal: { aggregate: async () => ({ _sum: { monto: sum(options.salidas ?? []) } }) },
    // Un mismo traslado cuenta como recibido o enviado según de qué lado esté la sucursal.
    cashTransfer: {
      aggregate: async ({ where }: { where: { sucursalOrigenId?: string; sucursalDestinoId?: string } }) => ({
        _sum: {
          monto: sum(
            where.sucursalDestinoId ? (options.trasladosRecibidos ?? []) : (options.trasladosEnviados ?? []),
          ),
        },
      }),
    },
  } as never;
}

const FECHA = '2026-08-31';

describe('recalculateDailyBalance', () => {
  it('suma al saldo solo las ventas cobradas en efectivo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({
        saldoInicial: 1000,
        ventas: [500, { total: 300, metodoPago: 'deposito' }, { total: 200, metodoPago: 'cheque' }],
      }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalVentas).toBe(1000);
    expect(totals.totalVentasEfectivo).toBe(500);
    expect(totals.totalVentasOtrosMedios).toBe(500);
    expect(totals.saldoActual).toBe(1500);
  });

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

  it('resta las salidas de efectivo del saldo sin contarlas como gasto', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 1000, gastos: [50], salidas: [200, 100] }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalSalidas).toBe(300);
    expect(totals.totalGastos).toBe(50);
    expect(totals.saldoActual).toBe(650);
  });

  it('suma los traslados recibidos y resta los enviados a otras bodegas', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 1000, trasladosRecibidos: [400], trasladosEnviados: [150, 50] }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalTrasladosRecibidos).toBe(400);
    expect(totals.totalTrasladosEnviados).toBe(200);
    expect(totals.saldoActual).toBe(1200);
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

  it('suma el cobro del molido al saldo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({ saldoInicial: 100, molido: [50, 25] }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalMolido).toBe(75);
    expect(totals.saldoActual).toBe(175);
  });

  // Una compra pendiente no restó el día que se registró; resta el día que se paga.
  it('resta las compras pendientes liquidadas hoy en efectivo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({
        saldoInicial: 1000,
        compras: [{ total: 400, metodoPago: 'pendiente' }],
        pagosPendientes: [300],
      }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalCompras).toBe(400);
    expect(totals.totalComprasPendientes).toBe(400);
    // La compra de hoy no toca la gaveta; el pago de una pendiente vieja sí.
    expect(totals.totalComprasEfectivo).toBe(0);
    expect(totals.totalPagosPendientes).toBe(300);
    expect(totals.saldoActual).toBe(700);
  });

  // La venta al crédito no entra a la gaveta; el abono en efectivo sí, el día que llega.
  it('no suma las ventas al crédito y sí los abonos en efectivo', async () => {
    const { totals } = await recalculateDailyBalance(
      fakeDb({
        saldoInicial: 1000,
        ventas: [200, { total: 800, metodoPago: 'credito' }],
        cobros: [150],
      }),
      FECHA,
      'suc-1',
    );

    expect(totals.totalVentas).toBe(1000);
    expect(totals.totalVentasCredito).toBe(800);
    expect(totals.totalVentasOtrosMedios).toBe(800);
    expect(totals.totalCobros).toBe(150);
    expect(totals.saldoActual).toBe(1350);
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
