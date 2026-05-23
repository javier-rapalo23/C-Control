import { NextResponse } from 'next/server';
import { getAuthUserConfig } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();
    const password = String(body.password ?? '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID', message: 'userId is required' } }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID', message: 'password is required' } }, { status: 400 });
    }

    const userConfig = getAuthUserConfig(userId, process.env.RBAC_USERS_JSON);
    if (!userConfig) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unknown user. Revisa RBAC_USERS_JSON o usa las cuentas por defecto de desarrollo.',
          },
        },
        { status: 403 },
      );
    }

    if (!userConfig.password) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'User password is not configured in RBAC_USERS_JSON',
          },
        },
        { status: 500 },
      );
    }

    if (userConfig.password !== password) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid password' } }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, data: { userId, role: userConfig.role } });
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
