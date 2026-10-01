import type { NextRequest } from 'next/server';
import { emitirFiscalDocumentSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { emitirDocumentoFiscal, listFiscalDocuments } from '@/lib/fiscal-document';
import { requireApiModuleAccess } from '@/lib/require-api-module-access';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    return success(
      await listFiscalDocuments(prisma, {
        businessDate: searchParams.get('businessDate') ?? undefined,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        estado: searchParams.get('estado') ?? undefined,
      }),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Emitir es un permiso propio, configurable en Mantenimiento → Roles: no basta
    // con poder registrar compras.
    const { userId } = await requireApiModuleAccess(request, 'fiscal_emitir');
    const payload = emitirFiscalDocumentSchema.parse(await request.json());

    const documento = await emitirDocumentoFiscal(prisma, {
      origen: payload.origen,
      transactionId: payload.transactionId,
      usuario: userId,
      numeroManual: payload.numeroManual,
      ordenCompraExenta: payload.ordenCompraExenta,
    });

    return success(documento, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
