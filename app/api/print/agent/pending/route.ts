import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { checkAgentToken } from '@/lib/print-agent-auth';

export async function GET(request: Request) {
  const authError = checkAgentToken(request);
  if (authError) return authError;

  try {
    const job = await prisma.printJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) {
      return success(null);
    }

    const claimed = await prisma.printJob.updateMany({
      where: { id: job.id, status: 'pending' },
      data: { status: 'claimed' },
    });

    if (claimed.count === 0) {
      return success(null);
    }

    return success({
      id: job.id,
      printerIp: job.printerIp,
      printerPort: job.printerPort,
      payloadB64: job.payloadB64,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
