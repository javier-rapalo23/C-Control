import { getPurchaseReport } from '@/lib/reports';

type FakePurchase = {
  businessDate: string;
  productoId: string;
  productoNombre: string;
  libras: number;
  quintalesOro: number;
  total: number;
  cliente?: { id: string; nombres: string; apellidos: string };
};

// Toda compra pertenece a una transacción con cliente: el esquema lo exige.
const CLIENTE_POR_DEFECTO = { id: 'c0', nombres: 'Cliente', apellidos: 'General' };

function fakeDb(purchases: FakePurchase[]) {
  return {
    purchase: {
      findMany: async () =>
        purchases.map((purchase) => ({
          businessDate: new Date(`${purchase.businessDate}T00:00:00.000Z`),
          productoId: purchase.productoId,
          productoNombre: purchase.productoNombre,
          libras: purchase.libras,
          quintalesOro: purchase.quintalesOro,
          total: purchase.total,
          purchaseTransaction: { client: purchase.cliente ?? CLIENTE_POR_DEFECTO },
        })),
    },
  } as never;
}

const cafe = (businessDate: string, libras: number, total: number, cliente?: FakePurchase['cliente']): FakePurchase => ({
  businessDate,
  productoId: 'p1',
  productoNombre: 'Café uva',
  libras,
  quintalesOro: libras / 100,
  total,
  cliente,
});

describe('getPurchaseReport', () => {
  it('suma los totales del período', async () => {
    const report = await getPurchaseReport(fakeDb([cafe('2026-08-17', 100, 1000), cafe('2026-08-19', 50, 600)]), {
      from: '2026-08-16',
      to: '2026-08-22',
      groupBy: 'day',
    });

    expect(report.totals).toMatchObject({ totalLibras: 150, totalLempiras: 1600, numeroCompras: 2 });
    // Promedio real del período: 1600 / 150, no el promedio de los precios unitarios.
    expect(report.totals.promedioPorLibra).toBeCloseTo(10.6667, 4);
  });

  it('incluye los días sin compras en cero en vez de omitirlos', async () => {
    const report = await getPurchaseReport(fakeDb([cafe('2026-08-17', 100, 1000)]), {
      from: '2026-08-16',
      to: '2026-08-22',
      groupBy: 'day',
    });

    expect(report.periods).toHaveLength(7);
    expect(report.periods[0]).toMatchObject({ inicio: '2026-08-16', totalLempiras: 0, numeroCompras: 0 });
    expect(report.periods[1]).toMatchObject({ inicio: '2026-08-17', totalLempiras: 1000 });
  });

  it('agrupa por semana de domingo a sábado', async () => {
    const report = await getPurchaseReport(
      fakeDb([cafe('2026-08-22', 100, 1000), cafe('2026-08-23', 100, 900)]),
      { from: '2026-08-16', to: '2026-08-29', groupBy: 'week' },
    );

    expect(report.periods).toHaveLength(2);
    // El sábado 22 cierra la primera semana; el domingo 23 abre la segunda.
    expect(report.periods[0]).toMatchObject({ inicio: '2026-08-16', fin: '2026-08-22', totalLempiras: 1000 });
    expect(report.periods[1]).toMatchObject({ inicio: '2026-08-23', fin: '2026-08-29', totalLempiras: 900 });
    expect(report.periods[0].label).toBe('16 – 22 ago 2026');
  });

  it('agrupa por cliente y acumula varias compras del mismo', async () => {
    const ana = { id: 'c1', nombres: 'Ana', apellidos: 'Pérez' };
    const beto = { id: 'c2', nombres: 'Beto', apellidos: 'Cruz' };
    const report = await getPurchaseReport(
      fakeDb([
        cafe('2026-08-17', 100, 1000, ana),
        cafe('2026-08-18', 50, 500, ana),
        cafe('2026-08-19', 20, 200, beto),
      ]),
      { from: '2026-08-16', to: '2026-08-22', groupBy: 'day' },
    );

    expect(report.porCliente).toEqual([
      expect.objectContaining({ id: 'c1', nombre: 'Ana Pérez', totalLempiras: 1500, numeroCompras: 2 }),
      expect.objectContaining({ id: 'c2', nombre: 'Beto Cruz', totalLempiras: 200, numeroCompras: 1 }),
    ]);
    expect(report.totals.totalLempiras).toBe(1700);
  });

  it('ordena el desglose por monto descendente', async () => {
    const report = await getPurchaseReport(
      fakeDb([
        { ...cafe('2026-08-17', 10, 100), productoId: 'p1', productoNombre: 'Pequeño' },
        { ...cafe('2026-08-17', 90, 900), productoId: 'p2', productoNombre: 'Grande' },
      ]),
      { from: '2026-08-16', to: '2026-08-22', groupBy: 'day' },
    );

    expect(report.porProducto.map((row) => row.nombre)).toEqual(['Grande', 'Pequeño']);
  });

  it('no divide entre cero cuando no hay compras', async () => {
    const report = await getPurchaseReport(fakeDb([]), { from: '2026-08-16', to: '2026-08-22', groupBy: 'day' });

    expect(report.totals).toMatchObject({ totalLibras: 0, totalLempiras: 0, promedioPorLibra: 0 });
    expect(report.porProducto).toEqual([]);
  });

  it('rechaza un rango invertido', async () => {
    await expect(
      getPurchaseReport(fakeDb([]), { from: '2026-08-22', to: '2026-08-16', groupBy: 'day' }),
    ).rejects.toThrow(/invertido/);
  });
});
