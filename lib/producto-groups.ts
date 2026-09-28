import type { ProductoDTO } from '@/types/domain';

/**
 * Si la línea admite conversión a quintales oro. Chequeo estricto por `categoria`,
 * sin inferencia por nombre: el oro va a la facturación de fin de temporada y no
 * conviene que dependa de cómo se escribió un nombre.
 *
 * Incluye `otros` —requema, verde, guacuco, repaso—: el rendimiento se captura para
 * todos. Antes esos tipos además quedaban fuera de la facturación; ya no, el negocio
 * factura todo lo que compra y vende.
 *
 * Aquí vivían además `classifyProducto` y `groupProductos`, que partían el
 * catálogo en "En Uva", "En Pergamino" y "Otros" para la parrilla de Compras y
 * Ventas. Los paneles pasaron a mostrar los ocho tipos juntos —son pocos y se
 * buscan por nombre— y se quitaron: con el catálogo cerrado todo `Producto` nace
 * con categoría, así que el respaldo por nombre que hacían tampoco tenía ya a
 * quién clasificar.
 */
export function isCafeCategoria(producto: ProductoDTO): boolean {
  return producto.categoria !== null && producto.categoria !== undefined;
}
