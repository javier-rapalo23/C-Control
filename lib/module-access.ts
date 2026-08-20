import type { Prisma, PrismaClient } from '@prisma/client';
import { MODULE_DEFS } from '@/lib/modules';
import type { ModuleAccessDTO } from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Roles efectivos de cada módulo: el override guardado en `ModuleAccess` si existe,
 * y si no los `defaultRoles` de la definición.
 *
 * Los módulos `locked` ignoran cualquier override y se quedan con sus roles por
 * defecto (vacíos = solo admin). Es la misma regla que aplica el PATCH al
 * rechazarlos, y hace que un override viejo en la base no pueda abrirlos.
 */
export async function getModuleAccess(db: DbClient): Promise<ModuleAccessDTO[]> {
  const overrides = await db.moduleAccess.findMany();
  const overrideByKey = new Map(overrides.map((override) => [override.moduleKey, override.roles]));

  return MODULE_DEFS.map((def) => ({
    moduleKey: def.key,
    label: def.label,
    locked: Boolean(def.locked),
    roles: def.locked ? def.defaultRoles : overrideByKey.get(def.key) ?? def.defaultRoles,
  }));
}

/** Roles efectivos de un solo módulo. Un `moduleKey` desconocido no autoriza a nadie. */
export async function getModuleRoles(db: DbClient, moduleKey: string): Promise<string[]> {
  const def = MODULE_DEFS.find((module) => module.key === moduleKey);
  if (!def) {
    return [];
  }

  if (def.locked) {
    return def.defaultRoles;
  }

  const override = await db.moduleAccess.findUnique({ where: { moduleKey } });
  return override?.roles ?? def.defaultRoles;
}
