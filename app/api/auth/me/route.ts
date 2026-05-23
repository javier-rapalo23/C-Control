import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const cookie = request.cookies.get('rcontrol_user');
  const userId = cookie?.value ?? null;
  const usersByRoleRaw = process.env.RBAC_USERS_JSON ?? '{}';
  let usersByRole: Record<string, string> = {};
  try {
    usersByRole = JSON.parse(usersByRoleRaw);
  } catch {
    // ignore
  }

  if (!userId) {
    return NextResponse.json({ ok: true, data: { userId: null, role: null } });
  }

  const role = usersByRole[userId] ?? null;
  return NextResponse.json({ ok: true, data: { userId, role } });
}
