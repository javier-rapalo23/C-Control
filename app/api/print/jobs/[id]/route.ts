import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const job = await prisma.printJob.findUnique({ where: { id } });
    if (!job) {
      return failure('NOT_FOUND', 'Trabajo de impresión no encontrado', 404);
    }

    return success({ id: job.id, status: job.status, error: job.error });
  } catch (error) {
    return handleApiError(error);
  }
}
