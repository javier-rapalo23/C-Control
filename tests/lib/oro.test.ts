import { Prisma } from '@prisma/client';
import { computeQuintalesOro } from '@/lib/oro';

describe('computeQuintalesOro', () => {
  // El caso con el que el negocio verificó la fórmula: 11.37 quintales (1137 lb)
  // al 54 % de rendimiento liquidan 4.91 quintales oro.
  it('reproduce el ejemplo del negocio: 11.37 qq al 54 % = 4.91 qq oro', () => {
    const quintalesOro = computeQuintalesOro(new Prisma.Decimal(1137), new Prisma.Decimal(54));
    expect(Number(quintalesOro.toFixed(2))).toBe(4.91);
  });

  it('el rendimiento es un porcentaje, no una fracción', () => {
    const conPorcentaje = computeQuintalesOro(new Prisma.Decimal(1000), new Prisma.Decimal(80));
    expect(Number(conPorcentaje)).toBeCloseTo(6.4, 10);
  });

  it('escala linealmente con las libras', () => {
    const uno = computeQuintalesOro(new Prisma.Decimal(500), new Prisma.Decimal(54));
    const doble = computeQuintalesOro(new Prisma.Decimal(1000), new Prisma.Decimal(54));
    expect(Number(doble)).toBeCloseTo(Number(uno) * 2, 10);
  });

  // Compras y ventas usan esta misma función: con el mismo café y el mismo
  // rendimiento tienen que dar el mismo número, que antes no pasaba.
  it('no depende de ningún factor guardado en el producto', () => {
    const libras = new Prisma.Decimal(2500);
    const porcentaje = new Prisma.Decimal(53);
    expect(computeQuintalesOro(libras, porcentaje).toString()).toBe(
      libras.div(100).mul(porcentaje.div(100)).div('1.25').toString(),
    );
  });
});
