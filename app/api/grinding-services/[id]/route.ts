import { updateGrindingServiceSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { assertCashOpen } from '@/lib/cash-session';
import { mapGrindingService, recalculateDailyBalance } from '@/lib/ledger';
import { toBusinessDateString } from '@/lib/business-date';

type Params = {
  params: Promise<{ id: string }>;
};

const include = { client: { select: { nombre: true } } } as const;

/**
 * Libras y monto quedan editables después de guardar: el molido se cobra a
 * criterio y a veces se ajusta al entregar. Solo con la caja del día abierta,
 * porque el monto mueve el saldo.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payload = updateGrindingServiceSchema.parse(await request.json());

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.grindingService.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      if (payload.clientId !== undefined) {
        const client = await tx.client.findUnique({ where: { id: payload.clientId } });
        if (!client) {
          throw new Error('Client not found');
        }
      }

      const businessDate = toBusinessDateString(existing.businessDate);
      await assertCashOpen(tx, businessDate, existing.sucursalId);

      const service = await tx.grindingService.update({
        where: { id },
        data: {
          ...(payload.clientId !== undefined ? { clientId: payload.clientId } : {}),
          ...(payload.libras !== undefined ? { libras: payload.libras } : {}),
          ...(payload.monto !== undefined ? { monto: payload.monto } : {}),
          ...(payload.notas !== undefined ? { notas: payload.notas || null } : {}),
        },
        include,
      });

      await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
      return service;
    });

    if (!updated) {
      return failure('NOT_FOUND', 'Servicio de molido no encontrado', 404);
    }

    return success(mapGrindingService(updated));
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.grindingService.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const businessDate = toBusinessDateString(existing.businessDate);
      await assertCashOpen(tx, businessDate, existing.sucursalId);

      await tx.grindingService.delete({ where: { id } });
      await recalculateDailyBalance(tx, businessDate, existing.sucursalId);
      return existing;
    });

    if (!deleted) {
      return failure('NOT_FOUND', 'Servicio de molido no encontrado', 404);
    }

    return success({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
