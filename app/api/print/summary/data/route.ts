import { failure, handleApiError, success } from '@/lib/api-response';
import { buildSummaryForDate } from '@/lib/build-ticket';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get('businessDate');
    if (!businessDate) {
      return failure('VALIDATION_ERROR', 'businessDate es requerido', 400);
    }

    const { buffer } = await buildSummaryForDate(businessDate);
    return success({ payloadB64: buffer.toString('base64') });
  } catch (error) {
    return handleApiError(error);
  }
}
