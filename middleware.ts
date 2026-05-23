import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseAuthUsers, type UserRole } from '@/lib/auth';

const roleRank: Record<UserRole, number> = {
  viewer: 1,
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

  if (method === 'DELETE') {
    return 'admin';
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return 'editor';
  }

  return 'viewer';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api')) {
    const hasAuthCookie = Boolean(request.cookies.get('rcontrol_user')?.value?.trim());

    if (pathname === '/login') {
      return hasAuthCookie ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
    }

    return hasAuthCookie ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  const isRbacEnabled = (process.env.RBAC_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!isRbacEnabled) {
    return NextResponse.next();
  }

  const usersByRole = Object.fromEntries(
    Object.entries(parseAuthUsers(process.env.RBAC_USERS_JSON)).map(([userId, config]) => [userId, config.role]),
  ) as Record<string, UserRole>;
  if (Object.keys(usersByRole).length === 0) {
    return jsonError(500, 'RBAC_CONFIG_ERROR', 'RBAC_USERS_JSON is empty or invalid');
  }

  // allow x-user-id header or fallback to cookie `rcontrol_user`
  const userId = request.headers.get('x-user-id')?.trim();
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    try {
      const cookie = request.cookies.get('rcontrol_user');
      if (cookie) effectiveUserId = cookie.value?.trim();
    } catch {
      // ignore cookie parse errors
    }
  }

  if (!effectiveUserId) {
    return jsonError(401, 'UNAUTHORIZED', 'Missing x-user-id header or rcontrol_user cookie');
  }

  const userRole = usersByRole[effectiveUserId];
  if (!userRole) {
    return jsonError(403, 'FORBIDDEN', 'User is not authorized');
  }

  const neededRole = requiredRole(pathname, request.method);
  if (roleRank[userRole] < roleRank[neededRole]) {
    return jsonError(403, 'FORBIDDEN', 'Insufficient role permissions');
  }

  const response = NextResponse.next();
  response.headers.set('x-auth-user-id', effectiveUserId);
  response.headers.set('x-auth-role', userRole);
  return response;
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next|favicon.ico|api).*)'],
};
