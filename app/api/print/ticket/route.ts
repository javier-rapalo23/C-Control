import type { NextRequest } from 'next/server';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { buildTicketForOrigen } from '@/lib/build-ticket';
import { requireSessionUser } from '@/lib/request-user';

/**
 * Encola el ticket de 80 mm de una compra, una venta o un molido.
 *
 * Es **el mismo documento** que imprime `/print/<origen>/:id` en A4: si ya se emitió,
 * los dos formatos salen con el mismo número, el mismo CAI y el mismo desglose.
 *
 * `kind` acepta los nombres viejos (`purchase`, `sale`) porque los paneles los
 * mandaban así antes de que existiera el molido.
 */
const ORIGENES: Record<string, 'compra' | 'venta' | 'molido'> = {
  compra: 'compra',
  purchase: 'compra',
  venta: 'venta',
  sale: 'venta',
  molido: 'molido',
  grinding: 'molido',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId : null;
    const origen = ORIGENES[typeof body?.kind === 'string' ? body.kind : 'purchase'] ?? 'compra';
    if (!transactionId) {
      return failure('VALIDATION_ERROR', 'transactionId es requerido', 400);
    }

    const result = await buildTicketForOrigen(origen, transactionId);
    if (!result) {
      return failure('NOT_FOUND', 'Transacción no encontrada', 404);
    }

    const { buffer, company, documento } = result;

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

    // Cada impresión de un documento ya emitido queda en bitácora: el número no se
    // vuelve a asignar, así que lo único que se puede auditar es cuántas veces se
    // imprimió y en qué formato.
    if (documento) {
      const usuario = await requireSessionUser(request);
      const emitido = await prisma.fiscalDocument.findUnique({
        where: { numeroCompleto: documento.numeroCompleto },
        select: { id: true, caiId: true },
      });
      if (emitido) {
        await prisma.fiscalAuditLog.create({
          data: {
            accion: 'reimpresion',
            fiscalDocumentId: emitido.id,
            caiId: emitido.caiId,
            usuario,
            detalle: { formato: 'termico80', numeroCompleto: documento.numeroCompleto },
          },
        });
      }
    }

    return success({ jobId: job.id, status: job.status });
  } catch (error) {
    return handleApiError(error);
  }
}
