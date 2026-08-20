import { updateModuleAccessSchema } from '@/lib/validations';
import { handleApiError, success, failure } from '@/lib/api-response';
import { getModuleAccess } from '@/lib/module-access';
import { prisma } from '@/lib/prisma';
import { MODULE_DEFS } from '@/lib/modules';

export async function GET() {
  try {
    return success(await getModuleAccess(prisma));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = updateModuleAccessSchema.parse(await request.json());
    const defsByKey = new Map(MODULE_DEFS.map((def) => [def.key, def]));

    for (const entry of payload.modules) {
      const def = defsByKey.get(entry.moduleKey);
      if (!def) {
        return failure('VALIDATION_ERROR', `Unknown module: ${entry.moduleKey}`, 400);
      }
      if (def.locked) {
        return failure('VALIDATION_ERROR', `Module is locked and cannot be reconfigured: ${entry.moduleKey}`, 400);
      }
    }

    await prisma.$transaction(
      payload.modules.map((entry) =>
        prisma.moduleAccess.upsert({
          where: { moduleKey: entry.moduleKey },
          update: { roles: entry.roles },
          create: { moduleKey: entry.moduleKey, roles: entry.roles },
        }),
      ),
    );

    return success(await getModuleAccess(prisma));
  } catch (error) {
    return handleApiError(error);
  }
}
