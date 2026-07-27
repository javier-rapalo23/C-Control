import { updateModuleAccessSchema } from '@/lib/validations';
import { handleApiError, success, failure } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { MODULE_DEFS } from '@/lib/modules';
import type { ModuleAccessDTO } from '@/types/domain';

export async function GET() {
  try {
    const overrides = await prisma.moduleAccess.findMany();
    const overrideByKey = new Map(overrides.map((o) => [o.moduleKey, o.roles]));

    const modules: ModuleAccessDTO[] = MODULE_DEFS.map((def) => ({
      moduleKey: def.key,
      label: def.label,
      locked: Boolean(def.locked),
      roles: def.locked ? def.defaultRoles : overrideByKey.get(def.key) ?? def.defaultRoles,
    }));

    return success(modules);
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

    const overrides = await prisma.moduleAccess.findMany();
    const overrideByKey = new Map(overrides.map((o) => [o.moduleKey, o.roles]));

    const modules: ModuleAccessDTO[] = MODULE_DEFS.map((def) => ({
      moduleKey: def.key,
      label: def.label,
      locked: Boolean(def.locked),
      roles: def.locked ? def.defaultRoles : overrideByKey.get(def.key) ?? def.defaultRoles,
    }));

    return success(modules);
  } catch (error) {
    return handleApiError(error);
  }
}
