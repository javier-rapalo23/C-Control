import { failure, handleApiError, success } from '@/lib/api-response';
import { buildTicketForTransaction, buildTicketForSaleTransaction } from '@/lib/build-ticket';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');
    const kind = searchParams.get('kind') === 'sale' ? 'sale' : 'purchase';
    if (!transactionId) {
      return failure('VALIDATION_ERROR', 'transactionId es requerido', 400);
    }

    const result = kind === 'sale'
      ? await buildTicketForSaleTransaction(transactionId)
      : await buildTicketForTransaction(transactionId);
    if (!result) {
      return failure('NOT_FOUND', 'Transacción no encontrada', 404);
    }

    return success({ payloadB64: result.buffer.toString('base64') });
  } catch (error) {
    return handleApiError(error);
  }
}
