/**
 * La misma conversión que `lib/oro.ts`, en aritmética de punto flotante, para
 * las previsualizaciones del carrito en el navegador.
 *
 * Existe aparte porque `lib/oro.ts` importa `Prisma.Decimal` y arrastraría el
 * cliente de Prisma al bundle del cliente. El servidor sigue siendo la
 * autoridad: lo que se guarda es lo que calcula `computeQuintalesOro`, y esta
 * función solo tiene que coincidir con ella a la vista del usuario.
 */
export const FACTOR_PERGAMINO_ORO = 1.25;

export function previewQuintalesOro(libras: number, porcentajeOro: number): number {
  if (!libras || !porcentajeOro) return 0;
  return (libras / 100) * (porcentajeOro / 100) / FACTOR_PERGAMINO_ORO;
}
