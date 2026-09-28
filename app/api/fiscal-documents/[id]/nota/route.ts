import type { NextRequest } from 'next/server';
import { emitirFiscalNotaSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { emitirNotaFiscal } from '@/lib/fiscal-document';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * Emite una nota de crédito o de débito sobre el documento `id`.
 *
 * Permiso propio (`fiscal_nota`), por omisión solo admin: una nota de crédito rebaja un
 * ingreso ya declarado, así que pesa lo mismo que anular.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireApiModuleAccess(request, 'fiscal_nota');
    const { id } = await params;
    const payload = emitirFiscalNotaSchema.parse(await request.json());

    const nota = await emitirNotaFiscal(prisma, {
      documentoOrigenId: id,
      tipo: payload.tipo,
      monto: payload.monto,
      motivo: payload.motivo,
      usuario: userId,
      numeroManual: payload.numeroManual,
    });

    return success(nota, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
