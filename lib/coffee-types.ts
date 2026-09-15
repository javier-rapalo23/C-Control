/**
 * Catálogo cerrado de los tipos de café que compra el negocio.
 *
 * Vive en código y no como filas editables porque los tipos no cambian de una
 * temporada a otra, y dejarlos abiertos permitía que una sucursal escribiera
 * "seco" y otra "Pergamino Seco": dos productos distintos para el mismo café,
 * que los reportes de temporada contaban por separado.
 *
 * La tabla `Producto` sigue existiendo —compras, ventas y cargas apuntan a ella
 * por id, y el histórico no se puede reescribir—. Lo que hace este catálogo es
 * fijar qué filas deben existir y de qué categoría son; `pnpm seed-coffee-types`
 * las sincroniza.
 */

export type ProductoCategoria = 'uva' | 'pergamino' | 'otros';

export const PRODUCTO_CATEGORIAS: readonly ProductoCategoria[] = ['uva', 'pergamino', 'otros'];

export type CoffeeType = {
  nombre: string;
  categoria: ProductoCategoria;
};

/**
 * El pergamino se compra en tres estados —húmedo, mojado y seco— y cada uno se
 * paga distinto, así que son tres entradas y no un solo tipo con una nota.
 */
export const COFFEE_TYPES: readonly CoffeeType[] = [
  { nombre: 'Pergamino húmedo', categoria: 'pergamino' },
  { nombre: 'Pergamino mojado', categoria: 'pergamino' },
  { nombre: 'Pergamino seco', categoria: 'pergamino' },
  { nombre: 'Uva', categoria: 'uva' },
  { nombre: 'Requema', categoria: 'otros' },
  { nombre: 'Verde', categoria: 'otros' },
  { nombre: 'Guacuco', categoria: 'otros' },
  { nombre: 'Repaso', categoria: 'otros' },
];

export const PRODUCTO_CATEGORIA_LABELS: Record<ProductoCategoria, string> = {
  uva: 'En Uva',
  pergamino: 'En Pergamino',
  otros: 'Otros',
};

/**
 * Solo uva y pergamino se facturan al cierre de temporada; requema, verde,
 * guacuco y repaso se compran y se pagan igual, pero quedan fuera de la
 * facturación.
 *
 * Es una función y no una columna del catálogo para que no puedan discrepar:
 * el dato se deriva de la categoría, que es lo que el negocio realmente decide.
 */
export function esCategoriaFacturable(categoria: ProductoCategoria | null | undefined): boolean {
  return categoria === 'uva' || categoria === 'pergamino';
}

/** Tupla no vacía, como la exige `z.enum` en `lib/validations.ts`. */
export const COFFEE_TYPE_NOMBRES = COFFEE_TYPES.map((tipo) => tipo.nombre) as [string, ...string[]];

export function findCoffeeType(nombre: string): CoffeeType | undefined {
  const normalized = nombre.trim().toLowerCase();
  return COFFEE_TYPES.find((tipo) => tipo.nombre.toLowerCase() === normalized);
}
