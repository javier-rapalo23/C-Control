import type { NextRequest } from 'next/server';
import { closeCashSessionSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { closeCashSession, mapCashSession } from '@/lib/cash-session';
import { resolveSucursalId } from '@/lib/ledger';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/request-user';

export async function POST(request: NextRequest) {
  try {
    const payload = closeCashSessionSchema.parse(await request.json());
    const cerradaPor = await requireSessionUser(request);

    const session = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      return closeCashSession(tx, {
        businessDate: payload.businessDate,
        sucursalId,
        montoContado: payload.montoContado,
        cerradaPor,
        notas: payload.notas,
      });
    });

    return success(mapCashSession(session));
  } catch (error) {
    return handleApiError(error);
  }
}
