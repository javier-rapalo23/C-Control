import type { NextRequest } from 'next/server';
import { readSessionToken, verifySessionToken } from '@/lib/session';

/**
 * `userId` de quien hace la petición, para registrar autoría (quién abrió o cerró
 * la caja, quién confirmó una planilla).
 *
 * No sustituye al control de acceso del middleware: para cuando esto se ejecuta,
 * la sesión ya fue verificada. Se vuelve a leer el token porque la cabecera
 * `x-auth-user-id` que inyecta el middleware viaja en la respuesta, no aquí.
 */
export async function requireSessionUser(request: NextRequest): Promise<string> {
  const session = await verifySessionToken(readSessionToken(request));
  if (!session) {
    throw new Error('Sesión no válida.');
  }
  return session.userId;
}
