'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AuthMe = { userId: string | null; role: string | null };

export function useRoleGuard(isAllowed: (role: string | null) => boolean, redirectTo = '/purchases') {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const body = (await res.json()) as { ok: boolean; data?: AuthMe };
        const role = body.data?.role ?? null;
        if (!mounted) return;
        if (isAllowed(role)) {
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
  }, []);

  return status;
}
