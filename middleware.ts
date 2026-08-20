import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from '@/lib/auth';
import { SESSION_COOKIE, readSessionToken, verifySessionToken } from '@/lib/session';

const roleRank: Record<UserRole, number> = {
  viewer: 1,
  comprador: 2,
  editor: 2,
  admin: 3,
};

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function requiredRole(pathname: string, method: string): UserRole {
  if (pathname === '/api/export') {
    return 'admin';
  }

  if (pathname === '/api/import') {
    return 'admin';
  }

  if (pathname === '/api/ledger/initial-balance') {
    return 'admin';
  }

  if (pathname.startsWith('/api/employees')) {
    return 'admin';
  }

  if (pathname === '/api/settings/module-access' && method !== 'GET') {
    return 'admin';
  }

  if (method === 'DELETE') {
    return 'admin';
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return 'editor';
  }

  return 'viewer';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El rol viaja firmado dentro del token, así que autorizar no requiere consultar
  // la base — imposible desde el runtime Edge en el que corre este middleware.
  const session = await verifySessionToken(readSessionToken(request));

  if (!pathname.startsWith('/api')) {
    if (pathname === '/login') {
      return session ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
    }

    if (session) {
      return NextResponse.next();
    }

    // Se limpia la cookie inválida o expirada para no dejar al usuario en un
    // estado en el que el navegador la reenvía en cada intento.
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    redirect.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return redirect;
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  // El agente de impresión se autentica con su propio token compartido.
  if (pathname.startsWith('/api/print/agent/')) {
    return NextResponse.next();
  }

  // Por defecto activo: dejar la API sin control de acceso solo debe ser una
  // decisión explícita, no lo que ocurre si nadie configura la variable.
  const isRbacEnabled = (process.env.RBAC_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!isRbacEnabled) {
    return NextResponse.next();
  }

  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', 'Sesión ausente, inválida o expirada');
  }

  const userRole = session.role;
  if (!(userRole in roleRank)) {
    return jsonError(403, 'FORBIDDEN', 'Rol de usuario no reconocido');
  }

  const neededRole = requiredRole(pathname, request.method);
  if (roleRank[userRole] < roleRank[neededRole]) {
    return jsonError(403, 'FORBIDDEN', 'Insufficient role permissions');
  }

  const response = NextResponse.next();
  response.headers.set('x-auth-user-id', session.userId);
  response.headers.set('x-auth-role', userRole);
  return response;
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next|favicon.ico|api).*)'],
};
