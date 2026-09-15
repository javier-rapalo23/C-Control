import type { ProductoDTO } from '@/types/domain';
import { COFFEE_TYPES, PRODUCTO_CATEGORIA_LABELS, type ProductoCategoria } from '@/lib/coffee-types';

const DIACRITICS_PATTERN = new RegExp('[\u0300-\u036f]', 'g');

function normalizeNombre(nombre: string) {
  return nombre.toLowerCase().normalize('NFD').replace(DIACRITICS_PATTERN, '');
}

/**
 * Respaldo por nombre para las filas anteriores al catálogo cerrado, que pueden
 * no tener `categoria`. Se deriva del propio catálogo para que agregar un tipo
 * no obligue a tocar dos listas.
 *
 * Antes esta tabla metía verde, requema, guacuco y repaso dentro de **uva**, que
 * es justamente lo que la reunión aclaró que no son: son tipos por su cuenta y
 * no se facturan. Ahora caen en `otros`, como el catálogo manda.
 */
const NOMBRE_A_CATEGORIA: ReadonlyArray<readonly [string, ProductoCategoria]> = COFFEE_TYPES.map(
  (tipo) => [normalizeNombre(tipo.nombre), tipo.categoria] as const,
);

/** Nombres sueltos del histórico que no coinciden con ningún tipo del catálogo. */
const PERGAMINO_LEGACY = ['mojado', 'oreado', 'seco', 'segundo', 'corriente', 'humedo', 'pergamino'];

export type ProductoGroupKey = ProductoCategoria;

export function classifyProducto(producto: ProductoDTO): ProductoGroupKey {
  if (producto.categoria) return producto.categoria;

  const normalized = normalizeNombre(producto.nombre);
  const match = NOMBRE_A_CATEGORIA.find(([nombre]) => normalized === nombre);
  if (match) return match[1];
  if (normalized.includes('uva')) return 'uva';
  if (PERGAMINO_LEGACY.some((keyword) => normalized.includes(keyword))) return 'pergamino';
  return 'otros';
}

export type ProductoGroup = { label: string; key: ProductoGroupKey; items: ProductoDTO[] };

export function groupProductos(productos: ProductoDTO[]): ProductoGroup[] {
  const buckets: Record<ProductoCategoria, ProductoDTO[]> = { uva: [], pergamino: [], otros: [] };
  for (const producto of productos) {
    buckets[classifyProducto(producto)].push(producto);
  }
  return (['uva', 'pergamino', 'otros'] as const)
    .map((key) => ({ label: PRODUCTO_CATEGORIA_LABELS[key], key, items: buckets[key] }))
    .filter((group) => group.items.length > 0);
}

/**
 * Si la línea admite conversión a quintales oro. Chequeo estricto por `categoria`,
 * sin inferencia por nombre: el oro va a la facturación de fin de temporada y no
 * conviene que dependa de cómo se escribió un nombre.
 *
 * Incluye `otros` —requema, verde, guacuco, repaso—: esos tipos no se facturan,
 * pero el rendimiento se captura y se guarda igual. Lo que decide qué entra en la
 * facturación es `esCategoriaFacturable`, al armar el reporte de temporada, no la
 * captura.
 */
export function isCafeCategoria(producto: ProductoDTO): boolean {
  return producto.categoria !== null && producto.categoria !== undefined;
}
