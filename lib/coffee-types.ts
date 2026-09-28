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
 * Acá vivía `esCategoriaFacturable`: uva y pergamino se facturaban, y requema,
 * verde, guacuco y repaso quedaban fuera. **El negocio factura todo lo que compra y
 * vende**, así que la distinción se eliminó en vez de dejarla como una función que
 * siempre devuelve `true`. La categoría sigue existiendo para el reporte y para el
 * modo oro; lo que se fue es la idea de que algunos tipos no se documentan.
 */

/** Tupla no vacía, como la exige `z.enum` en `lib/validations.ts`. */
export const COFFEE_TYPE_NOMBRES = COFFEE_TYPES.map((tipo) => tipo.nombre) as [string, ...string[]];

export function findCoffeeType(nombre: string): CoffeeType | undefined {
  const normalized = nombre.trim().toLowerCase();
  return COFFEE_TYPES.find((tipo) => tipo.nombre.toLowerCase() === normalized);
}
