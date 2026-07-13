import { Prisma } from '@prisma/client';
import { handleApiError, success } from '@/lib/api-response';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get('productoId');

    const where: Prisma.ProductoCargaWhereInput = {};
    if (productoId) where.productoId = productoId;

    const cargas = await prisma.productoCarga.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    return success(
      cargas.map((c) => ({
        ...c,
        businessDate: toBusinessDateString(c.businessDate),
        libras: c.libras !== null ? Number(c.libras) : null,
        createdAt: c.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessDate, productoId, libras, descripcion } = body;

    if (!businessDate || !productoId) {
      return handleApiError(new Error('businessDate y productoId son requeridos'));
    }

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) {
      return handleApiError(new Error('Producto no encontrado'));
    }

    const carga = await prisma.productoCarga.create({
      data: {
        businessDate: parseBusinessDate(businessDate),
        productoId,
        productoNombre: producto.nombre,
        libras: libras !== undefined && libras !== null ? libras : null,
        descripcion: descripcion ?? null,
      },
    });

    return success({
      ...carga,
      businessDate: toBusinessDateString(carga.businessDate),
      libras: carga.libras !== null ? Number(carga.libras) : null,
      createdAt: carga.createdAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
