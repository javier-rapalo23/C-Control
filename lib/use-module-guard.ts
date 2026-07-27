'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODULE_DEFS, isRoleAllowed } from '@/lib/modules';
import type { ModuleAccessDTO } from '@/types/domain';

type AuthMe = { userId: string | null; role: string | null };

export function useModuleGuard(moduleKey: string, redirectTo = '/') {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, accessRes] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store' }),
          fetch('/api/settings/module-access', { cache: 'no-store' }),
        ]);
        const meBody = (await meRes.json()) as { ok: boolean; data?: AuthMe };
        const accessBody = (await accessRes.json()) as { ok: boolean; data?: ModuleAccessDTO[] };

        const role = meBody.data?.role ?? null;
        const def = MODULE_DEFS.find((m) => m.key === moduleKey);
        const configured = accessBody.data?.find((m) => m.moduleKey === moduleKey);
        const roles = configured?.roles ?? def?.defaultRoles ?? [];

        if (!mounted) return;

        if (isRoleAllowed(roles, role)) {
          setStatus('allowed');
        } else {
          setStatus('denied');
          router.replace(redirectTo);
        }
      } catch {
        if (mounted) setStatus('allowed');
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  return status;
}
