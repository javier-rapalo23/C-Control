import { NextResponse } from 'next/server';
import { getAuthUserConfig, getDbUserConfig } from '@/lib/auth';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from '@/lib/session';

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
    const dbUserConfig = await getDbUserConfig(userId, prisma);
    const userConfig = dbUserConfig ?? getAuthUserConfig(userId, process.env.RBAC_USERS_JSON);

    if (!userConfig) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Usuario no encontrado.' } },
        { status: 403 },
      );
    }

    const storedPassword = userConfig.password ?? '';
    if (!(await verifyPassword(password, storedPassword))) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Contraseña incorrecta.' } }, { status: 401 });
    }

    // Migración transparente: la primera vez que un usuario con contraseña legacy
    // en texto plano se autentica, se reemplaza por su hash. Los usuarios de
    // `RBAC_USERS_JSON` no se tocan porque viven en el entorno, no en la base.
    if (dbUserConfig && needsRehash(storedPassword)) {
      await prisma.user.update({ where: { userId }, data: { password: await hashPassword(password) } });
    }

    const token = await createSessionToken(userId, userConfig.role);
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'SESSION_NOT_CONFIGURED',
            message: 'Falta la variable de entorno SESSION_SECRET; no se pueden emitir sesiones.',
          },
        },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        userId,
        role: userConfig.role,
        // Para clientes no web (app móvil): reenviar como `Authorization: Bearer <token>`.
        token,
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      },
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'ERROR', message: (error as Error).message } }, { status: 500 });
  }
}
