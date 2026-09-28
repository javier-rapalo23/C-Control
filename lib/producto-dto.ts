import type { Prisma } from '@prisma/client';
import type { ProductoCategoria } from '@/lib/coffee-types';
import type { ProductoDTO } from '@/types/domain';

type ProductoRow = {
  id: string;
  nombre: string;
  categoria: string | null;
  taraPorSaco: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapProducto(producto: ProductoRow): ProductoDTO {
  const categoria = (producto.categoria as ProductoCategoria | null) ?? null;
  return {
    id: producto.id,
    nombre: producto.nombre,
    categoria,
    taraPorSaco: producto.taraPorSaco !== null ? Number(producto.taraPorSaco) : null,
    createdAt: producto.createdAt.toISOString(),
    updatedAt: producto.updatedAt.toISOString(),
  };
}
