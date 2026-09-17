import type { NextRequest } from 'next/server';
import { createCashTransferSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { cashTransferInclude, mapCashTransfer, recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate } from '@/lib/business-date';
import { requireSessionUser } from '@/lib/request-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));

    const transfers = await prisma.cashTransfer.findMany({
      where: {
        OR: [{ sucursalOrigenId: sucursalId }, { sucursalDestinoId: sucursalId }],
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
      include: cashTransferInclude,
    });

    return success(transfers.map(mapCashTransfer));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createCashTransferSchema.parse(await request.json());
    const registradoPor = await requireSessionUser(request);

    const transfer = await prisma.$transaction(async (tx) => {
      const sucursales = await tx.sucursal.findMany({
        where: { id: { in: [payload.sucursalOrigenId, payload.sucursalDestinoId] }, activo: true },
        select: { id: true },
      });
      if (sucursales.length !== 2) {
        throw new Error('La bodega de origen o de destino no existe o está inactiva');
      }

      // Las dos cajas se mueven, así que ninguna de las dos puede estar cerrada.
      await assertCashOpen(tx, payload.businessDate, payload.sucursalOrigenId);
      await assertCashOpen(tx, payload.businessDate, payload.sucursalDestinoId);

      const created = await tx.cashTransfer.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalOrigenId: payload.sucursalOrigenId,
          sucursalDestinoId: payload.sucursalDestinoId,
          descripcion: payload.descripcion || null,
          monto: payload.monto,
          registradoPor,
        },
        include: cashTransferInclude,
      });

      await recalculateDailyBalance(tx, payload.businessDate, payload.sucursalOrigenId);
      await recalculateDailyBalance(tx, payload.businessDate, payload.sucursalDestinoId);
      return created;
    });

    return success(mapCashTransfer(transfer), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
