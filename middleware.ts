import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type UserRole = 'viewer' | 'editor' | 'admin';

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

function parseUsersByRole(rawValue: string | undefined): Record<string, UserRole> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const validEntries = Object.entries(parsed).filter(
      (entry): entry is [string, UserRole] =>
        typeof entry[0] === 'string' &&
        (entry[1] === 'viewer' || entry[1] === 'editor' || entry[1] === 'admin'),
    );

    return Object.fromEntries(validEntries);
  } catch {
    return {};
  }
}

function requiredRole(pathname: string, method: string): UserRole {
  if (pathname === '/api/export') {
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
    return NextResponse.next();
  }

  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  const isRbacEnabled = (process.env.RBAC_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!isRbacEnabled) {
    return NextResponse.next();
  }

  const usersByRole = parseUsersByRole(process.env.RBAC_USERS_JSON);
  if (Object.keys(usersByRole).length === 0) {
    return jsonError(500, 'RBAC_CONFIG_ERROR', 'RBAC_USERS_JSON is empty or invalid');
  }

  const userId = request.headers.get('x-user-id')?.trim();
  if (!userId) {
    return jsonError(401, 'UNAUTHORIZED', 'Missing x-user-id header');
  }

  const userRole = usersByRole[userId];
  if (!userRole) {
    return jsonError(403, 'FORBIDDEN', 'User is not authorized');
  }

  const neededRole = requiredRole(pathname, request.method);
  if (roleRank[userRole] < roleRank[neededRole]) {
    return jsonError(403, 'FORBIDDEN', 'Insufficient role permissions');
  }

  const response = NextResponse.next();
  response.headers.set('x-auth-user-id', userId);
  response.headers.set('x-auth-role', userRole);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
