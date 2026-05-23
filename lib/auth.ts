export type UserRole = 'viewer' | 'editor' | 'admin';

export type AuthUserConfig = {
  role: UserRole;
  password?: string;
};

const defaultAuthUsers: Record<string, AuthUserConfig> = {
  admin: { role: 'admin', password: 'admin123' },
  operador1: { role: 'editor', password: 'operador123' },
  consulta1: { role: 'viewer', password: 'consulta123' },
};

export function parseAuthUsers(rawValue: string | undefined): Record<string, AuthUserConfig> {
  if (!rawValue) {
    return defaultAuthUsers;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const entries = Object.entries(parsed).flatMap(([userId, value]) => {
      if (typeof value === 'string') {
        if (value === 'viewer' || value === 'editor' || value === 'admin') {
          return [[userId, { role: value } satisfies AuthUserConfig]] as Array<[string, AuthUserConfig]>;
        }

        return [] as Array<[string, AuthUserConfig]>;
      }

      if (!value || typeof value !== 'object') {
        return [] as Array<[string, AuthUserConfig]>;
      }

      const role = (value as { role?: unknown }).role;
      const password = (value as { password?: unknown }).password;

      if (role !== 'viewer' && role !== 'editor' && role !== 'admin') {
        return [] as Array<[string, AuthUserConfig]>;
      }

      return [[userId, { role, ...(typeof password === 'string' ? { password } : {}) }]] as Array<[
        string,
        AuthUserConfig,
      ]>;
    });

    const parsedUsers = Object.fromEntries(entries);
    return Object.keys(parsedUsers).length > 0 ? parsedUsers : defaultAuthUsers;
  } catch {
    return defaultAuthUsers;
  }
}

export function getAuthUserConfig(userId: string, rawValue: string | undefined): AuthUserConfig | null {
  const users = parseAuthUsers(rawValue);
  return users[userId] ?? null;
}
