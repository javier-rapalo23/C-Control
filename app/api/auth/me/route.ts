import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuthUserConfig } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('rcontrol_user');
  const userId = cookie?.value ?? null;

  if (!userId) {
    return NextResponse.json({ ok: true, data: { userId: null, role: null } });
  }

  const role = getAuthUserConfig(userId, process.env.RBAC_USERS_JSON)?.role ?? null;
  return NextResponse.json({ ok: true, data: { userId, role } });
}
