import { NextResponse } from 'next/server';
import { getAuthUserConfig, getDbUserConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    // Check DB users first, then fall back to env vars
    let userConfig = await getDbUserConfig(userId, prisma);
    if (!userConfig) {
      userConfig = getAuthUserConfig(userId, process.env.RBAC_USERS_JSON);
    }

    if (!userConfig) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Usuario no encontrado.' } },
        { status: 403 },
      );
    }

    if (!userConfig.password || userConfig.password !== password) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Contraseña incorrecta.' } }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, data: { userId, role: userConfig.role } });
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
