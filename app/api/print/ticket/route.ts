import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { buildTicketForTransaction } from '@/lib/build-ticket';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId : null;
    if (!transactionId) {
      return failure('VALIDATION_ERROR', 'transactionId es requerido', 400);
    }

    const result = await buildTicketForTransaction(transactionId);
    if (!result) {
      return failure('NOT_FOUND', 'Transacción no encontrada', 404);
    }

    const { buffer, company } = result;

    if (!company.printerIp) {
      return failure(
        'PRINTER_NOT_CONFIGURED',
        'No se ha configurado la IP de la impresora térmica. Ve a Mantenimiento > Empresa.',
        400,
      );
    }

    const job = await prisma.printJob.create({
      data: {
        printerIp: company.printerIp,
        printerPort: company.printerPort,
        payloadB64: buffer.toString('base64'),
      },
    });

    return success({ jobId: job.id, status: job.status });
  } catch (error) {
    return handleApiError(error);
  }
}
