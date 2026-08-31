import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveUserConfig } from '@/lib/auth';
import { getModuleRoles } from '@/lib/module-access';
import { isRoleAllowed } from '@/lib/modules';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

/**
 * Control de acceso por módulo, ejecutado en el servidor.
 *
 * Debe llamarse desde el server component de cada página o layout de módulo. Es
 * la autorización real: el middleware solo comprueba que haya sesión válida y no
 * puede consultar `ModuleAccess` porque corre en runtime Edge.
 *
 * Falla cerrado por construcción: cualquier camino que no confirme el permiso
 * termina en `redirect`, y un error de base de datos propaga en vez de conceder acceso.
 */
export async function requireModuleAccess(moduleKey: string, redirectTo = '/') {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect('/login');
  }

  // Se reconsulta el rol en lugar de confiar en el que viaja firmado en el token:
  // así un cambio de rol o una desactivación surten efecto en la siguiente
  // navegación, sin esperar a que la sesión expire.
  const resolved = await resolveUserConfig(session.userId, prisma, process.env.RBAC_USERS_JSON);
  if (!resolved) {
    redirect('/login');
  }

  const roles = await getModuleRoles(prisma, moduleKey);
  if (!isRoleAllowed(roles, resolved.config.role)) {
    redirect(redirectTo);
  }

  return { userId: session.userId, role: resolved.config.role };
}
