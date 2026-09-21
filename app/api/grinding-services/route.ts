import type { NextRequest } from 'next/server';
import { createGrindingServiceSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { mapGrindingService, recalculateDailyBalance, resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate } from '@/lib/business-date';
import { requireSessionUser } from '@/lib/request-user';

const include = { client: { select: { nombre: true } } } as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate');
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));

    const services = await prisma.grindingService.findMany({
      where: {
        sucursalId,
        ...(businessDate ? { businessDate: parseBusinessDate(businessDate) } : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      include,
    });

    return success(services.map(mapGrindingService));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createGrindingServiceSchema.parse(await request.json());
    const registradoPor = await requireSessionUser(request);

    const service = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: payload.clientId } });
      if (!client) {
        throw new Error('Client not found');
      }

      const sucursalId = await resolveSucursalId(tx, payload.sucursalId);
      await assertCashOpen(tx, payload.businessDate, sucursalId);

      const created = await tx.grindingService.create({
        data: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          clientId: client.id,
          libras: payload.libras,
          monto: payload.monto,
          notas: payload.notas || null,
          registradoPor,
        },
        include,
      });

      await recalculateDailyBalance(tx, payload.businessDate, sucursalId);
      return created;
    });

    return success(mapGrindingService(service), 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }
    return handleApiError(error);
  }
}
