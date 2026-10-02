import { Prisma } from '@prisma/client';
import { computeQuintalesOro } from '@/lib/oro';

describe('computeQuintalesOro', () => {
  // El caso con el que el negocio explicó la fórmula (02/10/2026): a 428 lb se les
  // resta el 60 % y lo que queda se divide entre 1.25.
  it('reproduce el ejemplo del negocio: 428 lb con factor 60 = 1.3696 qq oro', () => {
    const quintalesOro = computeQuintalesOro(new Prisma.Decimal(428), new Prisma.Decimal(60));
    expect(quintalesOro.toString()).toBe('1.3696');
  });

  // Es lo que se confundía: el factor se resta, no es lo que queda. Con el factor
  // usado como rendimiento, el mismo caso daría 2.0544 qq.
  it('el factor es lo que se resta, no lo que queda', () => {
    const quintalesOro = computeQuintalesOro(new Prisma.Decimal(428), new Prisma.Decimal(60));
    expect(Number(quintalesOro)).not.toBeCloseTo(2.0544, 4);
  });

  it('el factor es un porcentaje, no una fracción', () => {
    // 1000 − 20 % = 800; 800 / 1.25 = 640 lb oro = 6.4 qq.
    const quintalesOro = computeQuintalesOro(new Prisma.Decimal(1000), new Prisma.Decimal(20));
    expect(Number(quintalesOro)).toBeCloseTo(6.4, 10);
  });

  it('escala linealmente con las libras', () => {
    const uno = computeQuintalesOro(new Prisma.Decimal(500), new Prisma.Decimal(60));
    const doble = computeQuintalesOro(new Prisma.Decimal(1000), new Prisma.Decimal(60));
    expect(Number(doble)).toBeCloseTo(Number(uno) * 2, 10);
  });

  // Compras y ventas usan esta misma función: con el mismo café y el mismo factor
  // tienen que dar el mismo número, que antes no pasaba.
  it('no depende de ningún factor guardado en el producto', () => {
    const libras = new Prisma.Decimal(2500);
    const factor = new Prisma.Decimal(53);
    expect(computeQuintalesOro(libras, factor).toString()).toBe(
      libras.sub(libras.mul(factor).div(100)).div('1.25').div(100).toString(),
    );
  });
});
