import { Prisma } from '@prisma/client';
import { toBusinessDateString } from '@/lib/business-date';
import type { PendingPaymentDTO } from '@/types/domain';

export const pendingPaymentInclude = {
  client: { select: { nombre: true } },
  _count: { select: { items: true } },
} as const;

export function mapPendingPayment(transaction: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  numeroFactura: string | null;
  total: Prisma.Decimal;
  pagoFecha: Date | null;
  pagoMetodo: string | null;
  client: { nombre: string };
  _count: { items: number };
}): PendingPaymentDTO {
  return {
    id: transaction.id,
    businessDate: toBusinessDateString(transaction.businessDate),
    sucursalId: transaction.sucursalId,
    clientNombre: transaction.client.nombre,
    numeroFactura: transaction.numeroFactura,
    total: Number(transaction.total),
    itemsCount: transaction._count.items,
    pagoFecha: transaction.pagoFecha ? toBusinessDateString(transaction.pagoFecha) : null,
    pagoMetodo: transaction.pagoMetodo,
  };
}
