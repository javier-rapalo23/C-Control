import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { buildSummaryForDate } from '@/lib/build-ticket';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const businessDate = typeof body?.businessDate === 'string' ? body.businessDate : null;
    if (!businessDate) {
      return failure('VALIDATION_ERROR', 'businessDate es requerido', 400);
    }

    const { buffer, company } = await buildSummaryForDate(businessDate);

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
