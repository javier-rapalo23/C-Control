import { createProductoSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const productos = await prisma.producto.findMany({ orderBy: { createdAt: 'desc' } });
    return success(
      productos.map((producto) => ({
        ...producto,
        precioPorLibra: Number(producto.precioPorLibra),
        taraPorSaco: producto.taraPorSaco !== null ? Number(producto.taraPorSaco) : null,
        factorConversionOro: producto.factorConversionOro !== null ? Number(producto.factorConversionOro) : null,
        createdAt: producto.createdAt.toISOString(),
        updatedAt: producto.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createProductoSchema.parse(await request.json());

    const producto = await prisma.producto.create({
      data: {
        nombre: payload.nombre,
        categoria: payload.categoria,
        precioPorLibra: payload.precioPorLibra,
        taraPorSaco: payload.taraPorSaco,
        factorConversionOro: payload.factorConversionOro,
      },
    });

    return success(
      {
        ...producto,
        precioPorLibra: Number(producto.precioPorLibra),
        taraPorSaco: producto.taraPorSaco !== null ? Number(producto.taraPorSaco) : null,
        factorConversionOro: producto.factorConversionOro !== null ? Number(producto.factorConversionOro) : null,
        createdAt: producto.createdAt.toISOString(),
        updatedAt: producto.updatedAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
