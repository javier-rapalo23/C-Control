import type { NextRequest } from 'next/server';
import { reopenCashSessionSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { mapCashSession, reopenCashSession } from '@/lib/cash-session';
import { resolveSucursalId } from '@/lib/ledger';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/request-user';

// El middleware restringe esta ruta a rol admin (ver `requiredRole`).
export async function POST(request: NextRequest) {
  try {
    const payload = reopenCashSessionSchema.parse(await request.json());
    const reabiertaPor = await requireSessionUser(request);

    const session = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      return reopenCashSession(tx, { businessDate: payload.businessDate, sucursalId, reabiertaPor });
    });

    return success(mapCashSession(session));
  } catch (error) {
    return handleApiError(error);
  }
}
