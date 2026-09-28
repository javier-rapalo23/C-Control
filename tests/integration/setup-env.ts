import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Prepara el entorno de las pruebas de integración, que sí tocan una base de datos
 * real (el bloqueo de fila del correlativo fiscal no se puede simular con un doble).
 *
 * La base de pruebas se declara en `.env.test` como `TEST_DATABASE_URL`, con ese
 * nombre y no `DATABASE_URL` a propósito: si alguien copia el `.env` de siempre a
 * `.env.test`, no aparece la variable y las pruebas se saltan en vez de correr
 * contra producción. Además se compara con la URL de `.env` y, si coinciden, se
 * aborta: estas pruebas borran datos.
 */

const raiz = resolve(__dirname, '../..');

loadEnv({ path: resolve(raiz, '.env.test'), quiet: true });

function urlDeProduccion(): string | null {
  const archivo = resolve(raiz, '.env');
  if (!existsSync(archivo)) return null;
  const linea = readFileSync(archivo, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL'));
  if (!linea) return null;
  return linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

const urlPruebas = process.env.TEST_DATABASE_URL?.trim();

if (urlPruebas) {
  if (urlPruebas === urlDeProduccion()) {
    throw new Error(
      'TEST_DATABASE_URL apunta a la misma base que .env. Las pruebas de integración borran datos: ' +
        'usá una base aparte.',
    );
  }

  // Prisma lee `DATABASE_URL` al construir el cliente, así que se sustituye antes
  // de que cualquier prueba importe `@/lib/prisma`.
  process.env.DATABASE_URL = urlPruebas;
}
