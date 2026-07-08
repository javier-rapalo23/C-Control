import { companySettingsSchema } from '@/lib/validations';
import { handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

function formatCompany(c: {
  id: string;
  nombre: string;
  rtn: string;
  telefono: string;
  direccion: string;
  email: string;
  printerIp: string;
  printerPort: number;
  updatedAt: Date;
}) {
  return { ...c, updatedAt: c.updatedAt.toISOString() };
}

export async function GET() {
  try {
    const company = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return success(formatCompany(company));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = companySettingsSchema.parse(await request.json());
    const company = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: payload,
      create: { id: 'singleton', ...payload },
    });
    return success(formatCompany(company));
  } catch (error) {
    return handleApiError(error);
  }
}
