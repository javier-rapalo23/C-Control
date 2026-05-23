import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID', message: 'userId is required' } }, { status: 400 });
    }

    const usersByRoleRaw = process.env.RBAC_USERS_JSON ?? '{}';
    let usersByRole: Record<string, string> = {};
    try {
      usersByRole = JSON.parse(usersByRoleRaw);
    } catch {
      // fall through
    }

    if (!usersByRole[userId]) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unknown user' } }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, data: { userId, role: usersByRole[userId] } });
    // set HttpOnly cookie for subsequent requests
    response.cookies.set('rcontrol_user', userId, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'ERROR', message: (error as Error).message } }, { status: 500 });
  }
}
