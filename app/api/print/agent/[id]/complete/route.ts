import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { checkAgentToken } from '@/lib/print-agent-auth';

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const authError = checkAgentToken(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const isSuccess = body?.success === true;
    const errorMessage = typeof body?.error === 'string' ? body.error.slice(0, 500) : null;

    const job = await prisma.printJob.findUnique({ where: { id } });
    if (!job) {
      return failure('NOT_FOUND', 'Trabajo de impresión no encontrado', 404);
    }

    const updated = await prisma.printJob.update({
      where: { id },
      data: { status: isSuccess ? 'done' : 'error', error: isSuccess ? null : errorMessage },
    });

    return success({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleApiError(error);
  }
}
