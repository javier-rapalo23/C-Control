import type { NextRequest } from 'next/server';
import { createFiscalCaiSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { parseBusinessDate } from '@/lib/business-date';
import { fiscalCaiInclude, listFiscalCais, mapFiscalCai } from '@/lib/fiscal-cai';
import { requireSessionUser } from '@/lib/request-user';

export async function GET() {
  try {
    return success(await listFiscalCais(prisma));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createFiscalCaiSchema.parse(await request.json());
    const usuario = await requireSessionUser(request);

    const creado = await prisma.$transaction(async (tx) => {
      // Solo puede haber un CAI activo por tipo de documento (hay un índice parcial
      // que lo garantiza). Se desactiva el anterior en la misma transacción, porque
      // dar de alta el nuevo es justamente lo que reemplaza al que se agotó.
      await tx.fiscalCai.updateMany({
        where: { tipoDocumento: payload.tipoDocumento, estado: 'activo' },
        data: { estado: 'inactivo' },
      });

      const cai = await tx.fiscalCai.create({
        data: {
          tipoDocumento: payload.tipoDocumento,
          codigo: payload.codigo,
          codigoEstablecimiento: payload.codigoEstablecimiento,
          codigoPuntoEmision: payload.codigoPuntoEmision,
          codigoTipoDocumento: payload.codigoTipoDocumento,
          rangoDesde: payload.rangoDesde,
          rangoHasta: payload.rangoHasta,
          fechaLimite: parseBusinessDate(payload.fechaLimite),
          modo: payload.modo,
          // El contador arranca justo antes del rango: el primer número entregado
          // será `rangoDesde`.
          ultimoCorrelativo: payload.rangoDesde - 1,
          ...(payload.alertaPorcentaje !== undefined ? { alertaPorcentaje: payload.alertaPorcentaje } : {}),
          ...(payload.alertaDiasPrevios !== undefined ? { alertaDiasPrevios: payload.alertaDiasPrevios } : {}),
          notas: payload.notas || null,
        },
        include: fiscalCaiInclude,
      });

      await tx.fiscalAuditLog.create({
        data: {
          accion: 'cai_alta',
          caiId: cai.id,
          usuario,
          detalle: {
            tipoDocumento: cai.tipoDocumento,
            codigo: cai.codigo,
            rango: `${cai.rangoDesde}-${cai.rangoHasta}`,
            modo: cai.modo,
          },
        },
      });

      return cai;
    });

    return success(mapFiscalCai(creado), 201);
  } catch (error) {
    // El CAI es único: repetirlo casi siempre es cargarlo dos veces por error.
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return failure('CONFLICT', 'Ya existe un CAI con ese código.', 409);
    }
    return handleApiError(error);
  }
}
