import { Prisma } from '@prisma/client';
import { computeQuintalesOro } from '@/lib/oro';
import { previewQuintalesOro } from '@/lib/oro-preview';

// La previsualización del carrito vive aparte de `lib/oro.ts` para no arrastrar
// Prisma al bundle del cliente. Esta prueba es lo que impide que se separen.
describe('previewQuintalesOro', () => {
  const casos: Array<[number, number]> = [
    [1137, 54],
    [1000, 80],
    [237.5, 43.75],
    [95, 12.5],
  ];

  it.each(casos)('coincide con el servidor para %p lb al %p %%', (libras, porcentaje) => {
    const servidor = Number(computeQuintalesOro(new Prisma.Decimal(libras), new Prisma.Decimal(porcentaje)));
    expect(previewQuintalesOro(libras, porcentaje)).toBeCloseTo(servidor, 10);
  });

  it('devuelve 0 cuando todavía no hay rendimiento capturado', () => {
    expect(previewQuintalesOro(1137, 0)).toBe(0);
  });
});
