import type { NextRequest } from 'next/server';
import { createCashEntrySchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { mapCashEntry, recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate } from '@/lib/business-date';
import { requireSessionUser } from '@/lib/request-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));

    const entries = await prisma.cashEntry.findMany({
      where: {
        sucursalId,
        ...(businessDate
          ? { businessDate: parseBusinessDate(businessDate) }
          : from || to
            ? {
                businessDate: {
                  ...(from ? { gte: parseBusinessDate(from) } : {}),
                  ...(to ? { lte: parseBusinessDate(to) } : {}),
                },
              }
            : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    return success(entries.map(mapCashEntry));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createCashEntrySchema.parse(await request.json());
    const registradoPor = await requireSessionUser(request);

    const entry = await prisma.$transaction(async (tx) => {
      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      const created = await tx.cashEntry.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          descripcion: payload.descripcion,
          monto: payload.monto,
          registradoPor,
        },
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    return success(mapCashEntry(entry), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
