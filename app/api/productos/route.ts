import { createProductoSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { findCoffeeType } from '@/lib/coffee-types';
import { mapProducto } from '@/lib/producto-dto';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const productos = await prisma.producto.findMany({ orderBy: { nombre: 'asc' } });
    return success(productos.map(mapProducto));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createProductoSchema.parse(await request.json());

    // La categoría sale del catálogo, no de la petición: el cliente elige el tipo
    // de café y el catálogo dice de qué categoría es y si se factura.
    const tipo = findCoffeeType(payload.nombre);
    if (!tipo) {
      return failure('VALIDATION_ERROR', `Tipo de café desconocido: ${payload.nombre}`, 422);
    }

    const producto = await prisma.producto.create({
      data: {
        nombre: tipo.nombre,
        categoria: tipo.categoria,
        taraPorSaco: payload.taraPorSaco,
      },
    });

    return success(mapProducto(producto), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
