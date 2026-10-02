import { Prisma } from '@prisma/client';

/**
 * Conversión a quintales oro. **Una sola fórmula para compras y ventas.**
 *
 * Antes cada módulo tenía la suya: compras multiplicaba por un
 * `Producto.factorConversionOro` fijo y ventas aplicaba el porcentaje de la
 * línea. Con el mismo café, compras reportaba un 25 % más de quintales que
 * ventas. El factor varía por lote y por productor, así que amarrarlo al
 * catálogo de productos era la limitación de fondo: ahora se captura por línea
 * en los dos módulos.
 *
 * El **factor oro** es el porcentaje que se le resta a las libras —lo que se va en
 * el proceso—, no el que queda. A lo que queda se le aplica el divisor de
 * pergamino a oro:
 *
 *     librasOro    = (libras − libras × factorOro / 100) / 1.25
 *     quintalesOro = librasOro / 100
 *
 * Ejemplo del negocio (02/10/2026): 428 lb con factor 60 → 428 − 60 % = 171.2;
 * 171.2 / 1.25 = 136.96 lb oro = 1.3696 qq oro.
 *
 * La columna se sigue llamando `porcentajeOro` —renombrarla es una migración sin
 * beneficio—, pero lo que guarda es este factor.
 *
 * En compras el resultado es solo una cifra de referencia para la facturación
 * de fin de temporada: el pago al productor es `libras × precioPorLibra` y no
 * pasa por aquí. En ventas sí es la base del monto.
 */
export const FACTOR_PERGAMINO_ORO = new Prisma.Decimal('1.25');

export function computeQuintalesOro(libras: Prisma.Decimal, factorOro: Prisma.Decimal): Prisma.Decimal {
  const librasQueQuedan = libras.sub(libras.mul(factorOro).div(100));
  return librasQueQuedan.div(FACTOR_PERGAMINO_ORO).div(100);
}
