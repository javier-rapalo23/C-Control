import type { Prisma } from '@prisma/client';
import { esCategoriaFacturable, type ProductoCategoria } from '@/lib/coffee-types';
import type { ProductoDTO } from '@/types/domain';

type ProductoRow = {
  id: string;
  nombre: string;
  categoria: string | null;
  taraPorSaco: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * `facturable` se calcula al serializar y no se guarda: es una consecuencia de la
 * categoría, y una columna aparte podría terminar contradiciéndola.
 */
export function mapProducto(producto: ProductoRow): ProductoDTO {
  const categoria = (producto.categoria as ProductoCategoria | null) ?? null;
  return {
    id: producto.id,
    nombre: producto.nombre,
    categoria,
    taraPorSaco: producto.taraPorSaco !== null ? Number(producto.taraPorSaco) : null,
    facturable: esCategoriaFacturable(categoria),
    createdAt: producto.createdAt.toISOString(),
    updatedAt: producto.updatedAt.toISOString(),
  };
}
