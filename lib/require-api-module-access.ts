import type { NextRequest } from 'next/server';
import { resolveUserConfig } from '@/lib/auth';
import { getModuleRoles } from '@/lib/module-access';
import { isRoleAllowed } from '@/lib/modules';
import { prisma } from '@/lib/prisma';
import { readSessionToken, verifySessionToken } from '@/lib/session';

/**
 * Control de acceso por módulo para **rutas de API**.
 *
 * `requireModuleAccess` no sirve acá: vive en un server component y responde con
 * `redirect`, que a un cliente que espera JSON le llega como una redirección rara.
 * Este comprueba lo mismo y lanza `ModulePermissionError`, que `handleApiError`
 * traduce a **403 `FORBIDDEN`**.
 *
 * El middleware sigue siendo la primera puerta (sesión válida y rango de rol por
 * método), pero no puede consultar `ModuleAccess`: corre en runtime Edge. Los
 * permisos configurables, como emitir o anular un documento fiscal, se comprueban
 * acá.
 *
 * Falla cerrado: si no hay sesión, si el usuario ya no existe o está desactivado, o
 * si el `moduleKey` no está en el catálogo, no autoriza.
 */
export class ModulePermissionError extends Error {
  readonly moduleKey: string;

  constructor(moduleKey: string, message?: string) {
    super(message ?? 'No tiene permiso para esta acción.');
    this.name = 'ModulePermissionError';
    this.moduleKey = moduleKey;
  }
}

export async function requireApiModuleAccess(
  request: NextRequest | Request,
  moduleKey: string,
): Promise<{ userId: string; role: string }> {
  const session = await verifySessionToken(readSessionToken(request as NextRequest));
  if (!session) {
    throw new ModulePermissionError(moduleKey, 'Sesión ausente, inválida o expirada.');
  }

  // Se reconsulta el rol en vez de confiar en el que viaja firmado en el token, por
  // lo mismo que en las páginas: quitarle el permiso a alguien tiene que surtir
  // efecto en la siguiente petición, no cuando expire su sesión.
  const resolved = await resolveUserConfig(session.userId, prisma, process.env.RBAC_USERS_JSON);
  if (!resolved) {
    throw new ModulePermissionError(moduleKey, 'Usuario no encontrado o desactivado.');
  }

  const roles = await getModuleRoles(prisma, moduleKey);
  if (!isRoleAllowed(roles, resolved.config.role)) {
    throw new ModulePermissionError(moduleKey);
  }

  return { userId: session.userId, role: resolved.config.role };
}
