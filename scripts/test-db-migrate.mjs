/**
 * Aplica las migraciones a la base de datos de **pruebas**.
 *
 * Toma `TEST_DATABASE_URL` de `.env.test` y corre `prisma migrate deploy` contra
 * ella, sin tocar la base de `.env`. Se niega a correr si las dos URL coinciden:
 * las pruebas de integración borran datos.
 *
 *   pnpm test:db:migrate
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test', quiet: true });

const urlPruebas = process.env.TEST_DATABASE_URL?.trim();

if (!urlPruebas) {
  console.error('Falta TEST_DATABASE_URL en .env.test. Copiá .env.test.example y poné la URL de la base de pruebas.');
  process.exit(1);
}

function urlDeProduccion() {
  if (!existsSync('.env')) return null;
  const linea = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL'));
  if (!linea) return null;
  return linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

if (urlPruebas === urlDeProduccion()) {
  console.error('TEST_DATABASE_URL apunta a la misma base que .env. Usá una base aparte.');
  process.exit(1);
}

const { status } = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: urlPruebas },
});

process.exit(status ?? 1);
