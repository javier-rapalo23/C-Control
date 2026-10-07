import { Prisma } from '@prisma/client';
import { ReceivableError, distribuirAbono } from '@/lib/receivables';

const D = (valor: number) => new Prisma.Decimal(valor);

const pendientes = [
  { id: 'v1', saldo: D(500) },
  { id: 'v2', saldo: D(300) },
  { id: 'v3', saldo: D(200) },
];

const comoNumeros = (aplicaciones: ReturnType<typeof distribuirAbono>) =>
  aplicaciones.map((aplicacion) => [aplicacion.saleTransactionId, Number(aplicacion.monto)]);

describe('distribuirAbono', () => {
  it('reparte de la venta más antigua a la más reciente', () => {
    expect(comoNumeros(distribuirAbono(pendientes, D(650)))).toEqual([
      ['v1', 500],
      ['v2', 150],
    ]);
  });

  it('un abono parcial deja la primera venta con saldo', () => {
    expect(comoNumeros(distribuirAbono(pendientes, D(120.5)))).toEqual([['v1', 120.5]]);
  });

  it('liquida todo con el saldo exacto', () => {
    expect(comoNumeros(distribuirAbono(pendientes, D(1000)))).toEqual([
      ['v1', 500],
      ['v2', 300],
      ['v3', 200],
    ]);
  });

  it('aplica solo a la venta elegida', () => {
    expect(comoNumeros(distribuirAbono(pendientes, D(100), 'v3'))).toEqual([['v3', 100]]);
  });

  it('rechaza un abono mayor que lo que se debe', () => {
    expect(() => distribuirAbono(pendientes, D(1000.01))).toThrow(ReceivableError);
    expect(() => distribuirAbono(pendientes, D(250), 'v3')).toThrow(/mayor que el saldo/);
  });

  it('rechaza una venta que no está pendiente', () => {
    expect(() => distribuirAbono(pendientes, D(10), 'otra')).toThrow(/no tiene saldo pendiente/);
  });

  it('rechaza el abono de un cliente sin deudas', () => {
    expect(() => distribuirAbono([], D(10))).toThrow(/no tiene ventas a crédito pendientes/);
  });
});
