import type { UserRole } from '@/lib/auth';

/**
 * Sesión firmada con HMAC-SHA256.
 *
 * Usa Web Crypto (`crypto.subtle`), disponible tanto en el runtime Edge del
 * middleware como en el runtime Node de los route handlers. No importar aquí
 * `node:crypto` ni Prisma: rompería el middleware.
 *
 * El token lleva el rol dentro, de modo que el middleware puede autorizar sin
 * consultar la base de datos — algo que en Edge no podría hacer.
 *
 * Formato: `base64url(JSON payload).base64url(firma HMAC)`
 */

export type SessionPayload = {
  userId: string;
  role: UserRole;
  /** Expiración en segundos unix. */
  exp: number;
};

export const SESSION_COOKIE = 'rcontrol_user';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Secreto de desarrollo: solo fuera de producción, para que `pnpm dev` funcione
// sin configurar nada. En producción, la ausencia de SESSION_SECRET deja la app
// sin sesiones (falla cerrado) en vez de firmar con un valor predecible.
const DEV_SECRET = 'c-control-desarrollo-no-usar-en-produccion';

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }

  return process.env.NODE_ENV === 'production' ? null : DEV_SECRET;
}

/** Permite al login devolver un error explícito en vez de fallar en silencio. */
export function isSessionConfigured(): boolean {
  return getSecret() !== null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// El genérico explícito importa: `crypto.subtle.verify` exige un `BufferSource`
// respaldado por `ArrayBuffer`, y `Uint8Array` a secas se infiere sobre `ArrayBufferLike`.
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createSessionToken(userId: string, role: UserRole): Promise<string | null> {
  const secret = getSecret();
  if (!secret) {
    return null;
  }

  const payload: SessionPayload = {
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await getKey(secret), encoder.encode(body));

  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Devuelve el payload solo si la firma es válida y el token no expiró. */
export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload | null> {
  const secret = getSecret();
  if (!secret || !token) {
    return null;
  }

  const separator = token.indexOf('.');
  if (separator <= 0) {
    return null;
  }

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!signature) {
    return null;
  }

  try {
    const isValid = await crypto.subtle.verify(
      'HMAC',
      await getKey(secret),
      base64UrlToBytes(signature),
      encoder.encode(body),
    );
    if (!isValid) {
      return null;
    }

    const payload = JSON.parse(decoder.decode(base64UrlToBytes(body))) as SessionPayload;
    if (typeof payload?.userId !== 'string' || !payload.userId || typeof payload?.role !== 'string') {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    // Token mal formado (base64 inválido, JSON corrupto): se trata como no autenticado.
    return null;
  }
}

/** Lee el token de la cookie de sesión o de `Authorization: Bearer` (clientes no web). */
export function readSessionToken(request: {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization && authorization.slice(0, 7).toLowerCase() === 'bearer ') {
    const token = authorization.slice(7).trim();
    if (token) {
      return token;
    }
  }

  return request.cookies.get(SESSION_COOKIE)?.value?.trim() || null;
}
