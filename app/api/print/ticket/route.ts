import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';
import { buildTicketBuffer, sendToPrinter } from '@/lib/thermal-printer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId : null;
    if (!transactionId) {
      return failure('VALIDATION_ERROR', 'transactionId es requerido', 400);
    }

    const [transaction, company] = await Promise.all([
      prisma.purchaseTransaction.findUnique({
        where: { id: transactionId },
        include: { client: true, items: { orderBy: { createdAt: 'asc' } } },
      }),
      prisma.companySettings.upsert({
        where: { id: 'singleton' },
        update: {},
        create: { id: 'singleton' },
      }),
    ]);

    if (!transaction) {
      return failure('NOT_FOUND', 'Transacción no encontrada', 404);
    }

    if (!company.printerIp) {
      return failure(
        'PRINTER_NOT_CONFIGURED',
        'No se ha configurado la IP de la impresora térmica. Ve a Mantenimiento > Empresa.',
        400,
      );
    }

    const buffer = buildTicketBuffer({
      company: {
        nombre: company.nombre,
        rtn: company.rtn,
        telefono: company.telefono,
        direccion: company.direccion,
      },
      businessDate: toBusinessDateString(transaction.businessDate),
      clientNombre: transaction.client.nombre,
      items: transaction.items.map((item) => ({
        materialNombre: item.materialNombre,
        libras: Number(item.libras),
        precioPorLibra: Number(item.precioPorLibra),
        total: Number(item.total),
      })),
      total: Number(transaction.total),
    });

    await sendToPrinter(company.printerIp, company.printerPort, buffer);

    return success({ printed: true });
  } catch (error) {
    if (error instanceof Error && /impresora/i.test(error.message)) {
      return failure('PRINTER_ERROR', error.message, 502);
    }
    return handleApiError(error);
  }
}
