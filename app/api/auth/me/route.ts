import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveUserConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readSessionToken, verifySessionToken } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(readSessionToken(request));

  if (!session) {
    return NextResponse.json({ ok: true, data: { userId: null, role: null } });
  }

  // El token lleva el rol firmado, pero aquí sí hay base de datos: se reconsulta
  // para que un cambio de rol o una desactivación se reflejen en la UI sin
  // esperar a que el token expire.
  const resolved = await resolveUserConfig(session.userId, prisma, process.env.RBAC_USERS_JSON);

  if (!resolved) {
    return NextResponse.json({ ok: true, data: { userId: null, role: null } });
  }

  return NextResponse.json({ ok: true, data: { userId: session.userId, role: resolved.config.role } });
}
