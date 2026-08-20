import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Este módulo usa `node:crypto` y por lo tanto SOLO puede importarse desde route
// handlers (runtime Node). No lo importes desde `lib/auth.ts` ni desde nada que
// alcance `middleware.ts`: el middleware corre en runtime Edge, donde scrypt no existe.

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Formato almacenado: `scrypt$<salt-hex>$<derivada-hex>`. */
export function isHashed(stored: string): boolean {
  return stored.startsWith(`${SCHEME}$`);
}

/** Un valor sin el prefijo del esquema es una contraseña legacy en texto plano. */
export function needsRehash(stored: string): boolean {
  return !isHashed(stored);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEY_BYTES);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Comparación en tiempo constante que tolera longitudes distintas. */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Verifica contra un hash scrypt o, si el valor almacenado es legacy en texto
 * plano, contra el texto plano. Quien llame debe re-hashear cuando
 * `needsRehash(stored)` sea verdadero tras un login exitoso.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) {
    return false;
  }

  if (!isHashed(stored)) {
    return safeEqual(plain, stored);
  }

  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(plain, Buffer.from(saltHex, 'hex'), expected.length || KEY_BYTES);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
