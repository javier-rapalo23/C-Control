import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { todayBusinessDate } from '@/lib/business-date';
import { getAccountStatement } from '@/lib/receivables';

type Params = {
  params: Promise<{ clientId: string }>;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Estado de cuenta de un cliente, opcionalmente entre `desde` y `hasta`. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { clientId } = await params;
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) {
      return failure('VALIDATION_ERROR', 'Las fechas deben tener el formato YYYY-MM-DD', 400);
    }

    const statement = await getAccountStatement(prisma, clientId, { desde, hasta, hoy: todayBusinessDate() });
    if (!statement) {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }

    return success(statement);
  } catch (error) {
    return handleApiError(error);
  }
}
