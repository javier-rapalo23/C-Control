export type UserRole = 'viewer' | 'editor' | 'admin';

export type AuthUserConfig = {
  role: UserRole;
  password?: string;
};

export function parseAuthUsers(rawValue: string | undefined): Record<string, AuthUserConfig> {
  if (!rawValue) {
    return {};
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

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function getAuthUserConfig(userId: string, rawValue: string | undefined): AuthUserConfig | null {
  const users = parseAuthUsers(rawValue);
  return users[userId] ?? null;
}
