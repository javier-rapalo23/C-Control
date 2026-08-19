import type { ProductoDTO } from '@/types/domain';

const CAFE_UVA_KEYWORDS = ['uva', 'verde', 'requema', 'guacuco', 'repaso'];
const CAFE_PERGAMINO_KEYWORDS = ['mojado', 'oriado', 'seco', 'segundo', 'corriente'];

const DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeNombre(nombre: string) {
  return nombre.toLowerCase().normalize('NFD').replace(DIACRITICS_PATTERN, '');
}

export type ProductoGroupKey = 'uva' | 'pergamino' | 'otros';

export function classifyProducto(producto: ProductoDTO): ProductoGroupKey {
  if (producto.categoria === 'uva' || producto.categoria === 'pergamino') return producto.categoria;

  const normalized = normalizeNombre(producto.nombre);
  if (CAFE_UVA_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'uva';
  if (CAFE_PERGAMINO_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'pergamino';
  return 'otros';
}

export type ProductoGroup = { label: string; key: ProductoGroupKey; items: ProductoDTO[] };

export function groupProductos(productos: ProductoDTO[]): ProductoGroup[] {
  const uva: ProductoDTO[] = [];
  const pergamino: ProductoDTO[] = [];
  const otros: ProductoDTO[] = [];
  for (const producto of productos) {
    const group = classifyProducto(producto);
    if (group === 'uva') uva.push(producto);
    else if (group === 'pergamino') pergamino.push(producto);
    else otros.push(producto);
  }
  return [
    { label: 'En Uva', key: 'uva' as const, items: uva },
    { label: 'En Pergamino', key: 'pergamino' as const, items: pergamino },
    { label: 'Otros', key: 'otros' as const, items: otros },
  ].filter((group) => group.items.length > 0);
}

// Chequeo estricto por el campo categoria (sin fallback por nombre), usado para decidir
// cuándo activar el modo de conversión a Oro en Ventas.
export function isCafeCategoria(producto: ProductoDTO): boolean {
  return producto.categoria === 'uva' || producto.categoria === 'pergamino';
}
