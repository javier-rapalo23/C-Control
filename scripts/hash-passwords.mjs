/**
 * Backfill único: reemplaza por su hash scrypt las contraseñas de `User` que
 * todavía estén en texto plano.
 *
 * El login migra cada contraseña legacy la primera vez que el usuario entra,
 * pero hasta entonces el texto plano sigue vivo en la base y en los respaldos.
 * Este script cierra esa ventana de una sola pasada.
 *
 * El formato debe coincidir con `lib/password.ts` (`scrypt$<salt-hex>$<derivada-hex>`);
 * ese archivo es la fuente de verdad. Aquí se reimplementa porque Node no puede
 * importar TypeScript directamente.
 *
 *   node scripts/hash-passwords.mjs            # aplica los cambios
 *   node scripts/hash-passwords.mjs --dry-run  # solo reporta
 */
import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scryptAsync = promisify(scrypt);

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

async function hashPassword(plain) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEY_BYTES);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  const users = await prisma.user.findMany({ select: { id: true, userId: true, password: true } });
  const legacy = users.filter((user) => !user.password.startsWith(`${SCHEME}$`));

  if (legacy.length === 0) {
    console.log(`Nada que hacer: las ${users.length} contraseñas ya están hasheadas.`);
  } else {
    console.log(`${legacy.length} de ${users.length} contraseñas están en texto plano.`);

    for (const user of legacy) {
      if (dryRun) {
        console.log(`  [dry-run] se hashearía: ${user.userId}`);
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(user.password) },
      });
      console.log(`  hasheada: ${user.userId}`);
    }

    if (!dryRun) {
      console.log('Listo. Las contraseñas siguen siendo válidas para iniciar sesión.');
    }
  }
} catch (error) {
  console.error('Falló el backfill:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
