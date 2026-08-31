export type UserRole = 'viewer' | 'editor' | 'admin' | 'comprador';

export type AuthUserConfig = {
  role: UserRole;
  password?: string;
};

// No default admin fallback: admin access must come from a DB-managed User
// record (Mantenimiento > Usuarios, o `pnpm create-admin`). A hardcoded
// admin/admin123 credential here would be a permanent, non-revocable backdoor.
//
// Estas cuentas son solo para desarrollo local: sus contraseñas están en el
// código y en la documentación, así que en producción equivaldrían a dejar la
// puerta abierta. `resolveFallbackUsers` se encarga de que nunca existan allí.
const defaultAuthUsers: Record<string, AuthUserConfig> = {
  operador1: { role: 'editor', password: 'operador123' },
  consulta1: { role: 'viewer', password: 'consulta123' },
  comprador1: { role: 'comprador', password: 'comprador123' },
};

/**
 * Qué hacer cuando `RBAC_USERS_JSON` falta o no se puede leer.
 *
 * En producción, la ausencia de configuración no puede significar "usa las
 * cuentas de prueba": son credenciales publicadas. Falla cerrado y devuelve
 * ninguna cuenta, de modo que el acceso dependa solo de la tabla `User`.
 */
function resolveFallbackUsers(): Record<string, AuthUserConfig> {
  return process.env.NODE_ENV === 'production' ? {} : defaultAuthUsers;
}

function toAuthUserConfig(value: unknown): AuthUserConfig | null {
  if (typeof value === 'string') {
    return value === 'viewer' || value === 'editor' || value === 'admin' || value === 'comprador'
      ? { role: value }
      : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const role = (value as { role?: unknown }).role;
  const password = (value as { password?: unknown }).password;

  if (role !== 'viewer' && role !== 'editor' && role !== 'admin' && role !== 'comprador') {
    return null;
  }

  return { role, ...(typeof password === 'string' ? { password } : {}) };
}

/**
 * Lee `RBAC_USERS_JSON`.
 *
 * Un JSON válido es una declaración explícita y se respeta tal cual, **incluso
 * si queda vacío**: `{}` es la única forma de decir "sin cuentas de respaldo".
 * Antes un objeto vacío recaía en las cuentas de prueba, así que no había manera
 * de desactivarlas.
 */
export function parseAuthUsers(rawValue: string | undefined): Record<string, AuthUserConfig> {
  if (!rawValue || rawValue.trim() === '') {
    return resolveFallbackUsers();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return resolveFallbackUsers();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return resolveFallbackUsers();
  }

  const entries = Object.entries(parsed as Record<string, unknown>).flatMap(([userId, value]) => {
    const config = toAuthUserConfig(value);
    return config ? ([[userId, config]] as Array<[string, AuthUserConfig]>) : [];
  });

  return Object.fromEntries(entries);
}

export function getAuthUserConfig(userId: string, rawValue: string | undefined): AuthUserConfig | null {
  const users = parseAuthUsers(rawValue);
  return users[userId] ?? null;
}

export type DbUserLookup =
  | { status: 'active'; config: AuthUserConfig }
  | { status: 'inactive' }
  | { status: 'missing' };

/**
 * Busca al usuario en la tabla `User`.
 *
 * Distingue "no existe" de "existe pero está desactivado" porque las dos
 * situaciones tienen consecuencias distintas en `resolveUserConfig`. Los errores
 * de base de datos se propagan: tragárselos convertiría una caída de la base en
 * una concesión de acceso por la vía del respaldo de entorno.
 */
export async function findDbUser(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
): Promise<DbUserLookup> {
  const user = (await prismaClient.user.findUnique({ where: { userId } })) as
    | { password: string; role: string; activo: boolean }
    | null;

  if (!user) return { status: 'missing' };
  if (!user.activo) return { status: 'inactive' };
  return { status: 'active', config: { role: user.role as UserRole, password: user.password } };
}

export type ResolvedUser = {
  /** De dónde salió la cuenta. El login lo usa para decidir si rehashea. */
  source: 'db' | 'env';
  config: AuthUserConfig;
};

/**
 * Resuelve la cuenta que autentica a `userId`: primero la tabla `User`, y solo
 * si no existe allí, `RBAC_USERS_JSON`.
 *
 * Un usuario **desactivado** en la base no cae al respaldo de entorno: la baja es
 * una decisión explícita y no puede revertirse porque su `userId` también figure
 * en la variable.
 */
export async function resolveUserConfig(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  rawUsersJson: string | undefined,
): Promise<ResolvedUser | null> {
  const lookup = await findDbUser(userId, prismaClient);

  if (lookup.status === 'inactive') return null;
  if (lookup.status === 'active') return { source: 'db', config: lookup.config };

  const envConfig = getAuthUserConfig(userId, rawUsersJson);
  return envConfig ? { source: 'env', config: envConfig } : null;
}
