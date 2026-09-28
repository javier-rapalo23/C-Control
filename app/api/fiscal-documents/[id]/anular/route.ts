import type { NextRequest } from 'next/server';
import { anularFiscalDocumentSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { anularDocumentoFiscal } from '@/lib/fiscal-document';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    // Anular destruye el valor de un número ya entregado: permiso aparte del de
    // emitir, y por omisión solo admin.
    const { userId } = await requireApiModuleAccess(request, 'fiscal_anular');
    const { id } = await params;
    const payload = anularFiscalDocumentSchema.parse(await request.json());

    const documento = await anularDocumentoFiscal(prisma, {
      id,
      usuario: userId,
      motivo: payload.motivo,
      copiaFisicaResguardada: payload.copiaFisicaResguardada,
      copiaFisicaUbicacion: payload.copiaFisicaUbicacion,
    });

    if (!documento) {
      return failure('NOT_FOUND', 'Documento fiscal no encontrado', 404);
    }

    return success(documento);
  } catch (error) {
    return handleApiError(error);
  }
}
