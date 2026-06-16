import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuthUserConfig, getDbUserConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('rcontrol_user');
  const userId = cookie?.value ?? null;

  if (!userId) {
    return NextResponse.json({ ok: true, data: { userId: null, role: null } });
  }

  const userConfig = (await getDbUserConfig(userId, prisma)) ?? getAuthUserConfig(userId, process.env.RBAC_USERS_JSON);
  const role = userConfig?.role ?? null;
  return NextResponse.json({ ok: true, data: { userId, role } });
}
