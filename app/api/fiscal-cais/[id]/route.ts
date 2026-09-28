import type { NextRequest } from 'next/server';
import { updateFiscalCaiSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate } from '@/lib/business-date';
import { fiscalCaiInclude, mapFiscalCai } from '@/lib/fiscal-cai';
import { requireSessionUser } from '@/lib/request-user';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateFiscalCaiSchema.parse(await request.json());
    const usuario = await requireSessionUser(request);

    const actualizado = await prisma.$transaction(async (tx) => {
      const existente = await tx.fiscalCai.findUnique({ where: { id } });
      if (!existente) {
        return null;
      }

      // Activar este exige apagar el que esté activo del mismo tipo: el índice
      // parcial de la base rechazaría dos activos, y aquí el usuario solo dijo
      // "quiero usar este".
      if (payload.estado === 'activo' && existente.estado !== 'activo') {
        await tx.fiscalCai.updateMany({
          where: { tipoDocumento: existente.tipoDocumento, estado: 'activo', id: { not: id } },
          data: { estado: 'inactivo' },
        });
      }

      const cai = await tx.fiscalCai.update({
        where: { id },
        data: {
          ...(payload.estado !== undefined ? { estado: payload.estado } : {}),
          ...(payload.modo !== undefined ? { modo: payload.modo } : {}),
          ...(payload.fechaLimite !== undefined ? { fechaLimite: parseBusinessDate(payload.fechaLimite) } : {}),
          ...(payload.alertaPorcentaje !== undefined ? { alertaPorcentaje: payload.alertaPorcentaje } : {}),
          ...(payload.alertaDiasPrevios !== undefined ? { alertaDiasPrevios: payload.alertaDiasPrevios } : {}),
          ...(payload.notas !== undefined ? { notas: payload.notas || null } : {}),
        },
        include: fiscalCaiInclude,
      });

      await tx.fiscalAuditLog.create({
        data: { accion: 'cai_cambio', caiId: cai.id, usuario, detalle: { ...payload } },
      });

      return cai;
    });

    if (!actualizado) {
      return failure('NOT_FOUND', 'CAI no encontrado', 404);
    }

    return success(mapFiscalCai(actualizado));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const existente = await prisma.fiscalCai.findUnique({
      where: { id },
      select: { id: true, _count: { select: { documentos: true } } },
    });
    if (!existente) {
      return failure('NOT_FOUND', 'CAI no encontrado', 404);
    }

    // Un CAI con documentos emitidos es parte del historial fiscal: se desactiva,
    // no se borra. La llave foránea también lo impediría, pero el mensaje sería
    // ilegible.
    if (existente._count.documentos > 0) {
      return failure(
        'CONFLICT',
        'Este CAI ya tiene documentos emitidos. Desactívelo en vez de eliminarlo.',
        409,
      );
    }

    await prisma.fiscalCai.delete({ where: { id } });
    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
