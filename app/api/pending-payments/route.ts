import type { NextRequest } from 'next/server';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { resolveSucursalId } from '@/lib/ledger';
import { parseBusinessDate } from '@/lib/business-date';
import { PENDING_PAYMENT_METHOD } from '@/lib/payment-methods';
import { mapPendingPayment, pendingPaymentInclude } from '@/lib/pending-payments';

/**
 * Compras con pago pendiente de una bodega: las que siguen sin pagar (de
 * cualquier fecha) y las que se pagaron en `businessDate`, para poder revisarlas
 * o deshacerlas desde la caja de ese día.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sucursalId = await resolveSucursalId(prisma, searchParams.get('sucursalId'));
    const businessDate = searchParams.get('businessDate');

    const [pendientes, pagados] = await Promise.all([
      prisma.purchaseTransaction.findMany({
        where: { sucursalId, metodoPago: PENDING_PAYMENT_METHOD, pagoFecha: null },
        orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
        include: pendingPaymentInclude,
      }),
      businessDate
        ? prisma.purchaseTransaction.findMany({
            where: { sucursalId, metodoPago: PENDING_PAYMENT_METHOD, pagoFecha: parseBusinessDate(businessDate) },
            orderBy: { pagadoEn: 'desc' },
            include: pendingPaymentInclude,
          })
        : Promise.resolve([]),
    ]);

    return success({
      pendientes: pendientes.map(mapPendingPayment),
      pagados: pagados.map(mapPendingPayment),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
