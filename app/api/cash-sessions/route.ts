import type { NextRequest } from 'next/server';
import { openCashSessionSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { getCashSession, mapCashSession, openCashSession } from '@/lib/cash-session';
import { parseBusinessDate } from '@/lib/business-date';
import { resolveSucursalId } from '@/lib/ledger';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/request-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));

    if (businessDate) {
      const session = await getCashSession(prisma, businessDate, sucursalId);
      return success(session ? mapCashSession(session) : null);
    }

    const sessions = await prisma.cashSession.findMany({
      where: {
        sucursalId,
        ...(from || to
          ? {
              businessDate: {
                ...(from ? { gte: parseBusinessDate(from) } : {}),
                ...(to ? { lte: parseBusinessDate(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { businessDate: 'desc' },
      take: 60,
    });

    return success(sessions.map(mapCashSession));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = openCashSessionSchema.parse(await request.json());
    const abiertaPor = await requireSessionUser(request);

    const session = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      return openCashSession(tx, {
        businessDate: payload.businessDate,
        sucursalId,
        montoApertura: payload.montoApertura,
        abiertaPor,
        notas: payload.notas,
      });
    });

    return success(mapCashSession(session), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
