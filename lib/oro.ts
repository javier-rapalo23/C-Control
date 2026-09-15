import { Prisma } from '@prisma/client';

/**
 * Conversión a quintales oro. **Una sola fórmula para compras y ventas.**
 *
 * Antes cada módulo tenía la suya: compras multiplicaba por un
 * `Producto.factorConversionOro` fijo y ventas aplicaba el rendimiento de la
 * línea. Con el mismo café, compras reportaba un 25 % más de quintales que
 * ventas. El rendimiento varía por lote y por productor, así que amarrarlo al
 * catálogo de productos era la limitación de fondo: ahora se captura por línea
 * en los dos módulos.
 *
 *     quintalesOro = (libras / 100) × (porcentajeOro / 100) / 1.25
 *
 * Ejemplo del negocio: 11.37 qq al 54 % → 11.37 × 0.54 / 1.25 = 4.91 qq oro.
 *
 * En compras el resultado es solo una cifra de referencia para la facturación
 * de fin de temporada: el pago al productor es `libras × precioPorLibra` y no
 * pasa por aquí. En ventas sí es la base del monto.
 */
export const FACTOR_PERGAMINO_ORO = new Prisma.Decimal('1.25');

export function computeQuintalesOro(libras: Prisma.Decimal, porcentajeOro: Prisma.Decimal): Prisma.Decimal {
  return libras.div(100).mul(porcentajeOro.div(100)).div(FACTOR_PERGAMINO_ORO);
}
