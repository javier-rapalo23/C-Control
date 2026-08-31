/**
 * Crea (o restablece) un usuario `admin` en la tabla `User`.
 *
 * No existe ningún admin por defecto ni hardcodeado — decisión deliberada, ver
 * `lib/auth.ts` —, así que un despliegue nuevo no tiene forma de entrar a
 * Mantenimiento. Hasta ahora eso se resolvía a mano con Prisma Studio o SQL
 * directo contra la base de producción; este script lo vuelve un paso repetible
 * y deja la contraseña hasheada desde el primer momento, sin pasar nunca por
 * texto plano en la base ni en los respaldos.
 *
 * El formato del hash debe coincidir con `lib/password.ts`
 * (`scrypt$<salt-hex>$<derivada-hex>`); ese archivo es la fuente de verdad. Aquí
 * se reimplementa porque Node no puede importar TypeScript directamente.
 *
 *   node scripts/create-admin.mjs --user javier --name "Javier Orellana"
 *       Crea el admin con una contraseña aleatoria que se imprime una sola vez.
 *
 *   node scripts/create-admin.mjs --user javier --password-stdin
 *       Lee la contraseña de la entrada estándar (no queda en el historial del shell).
 *
 *   node scripts/create-admin.mjs --user javier --reset
 *       Restablece la contraseña de un usuario que ya existe y lo reactiva.
 *
 * Opciones: --user <userId> · --name <nombre> · --role <admin|editor|viewer|comprador>
 *           --password <texto> · --password-stdin · --reset · --list
 */
import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scryptAsync = promisify(scrypt);

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MIN_PASSWORD_LENGTH = 8;
const ROLES = ['admin', 'editor', 'viewer', 'comprador'];

async function hashPassword(plain) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEY_BYTES);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function parseArgs(argv) {
  const flags = { reset: false, list: false, passwordStdin: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`La opción ${arg} necesita un valor.`);
      }
      i += 1;
      return next;
    };

    switch (arg) {
      case '--user':
      case '--userId':
        flags.user = value();
        break;
      case '--name':
      case '--nombre':
        flags.name = value();
        break;
      case '--role':
      case '--rol':
        flags.role = value();
        break;
      case '--password':
        flags.password = value();
        break;
      case '--password-stdin':
        flags.passwordStdin = true;
        break;
      case '--reset':
        flags.reset = true;
        break;
      case '--list':
        flags.list = true;
        break;
      default:
        throw new Error(`Opción desconocida: ${arg}`);
    }
  }

  return flags;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

/** 32 caracteres base64url ≈ 192 bits: no hace falta que nadie la memorice. */
function generatePassword() {
  return randomBytes(24).toString('base64url');
}

async function listUsers(prisma) {
  const users = await prisma.user.findMany({
    select: { userId: true, nombre: true, role: true, activo: true },
    orderBy: [{ role: 'asc' }, { userId: 'asc' }],
  });

  if (users.length === 0) {
    console.log('La tabla User está vacía: nadie puede entrar todavía.');
    return;
  }

  console.log(`${users.length} usuario(s) en la base:`);
  for (const user of users) {
    const estado = user.activo ? 'activo' : 'DESACTIVADO';
    console.log(`  ${user.userId.padEnd(20)} ${user.role.padEnd(10)} ${estado}${user.nombre ? `  — ${user.nombre}` : ''}`);
  }
}

const prisma = new PrismaClient();

try {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.list) {
    await listUsers(prisma);
  } else if (!flags.user) {
    throw new Error('Falta --user <userId>. Usa --list para ver los usuarios existentes.');
  } else {
    const userId = flags.user.trim();
    const role = (flags.role ?? 'admin').trim();

    if (!userId) throw new Error('El userId no puede estar vacío.');
    if (!ROLES.includes(role)) throw new Error(`Rol inválido: ${role}. Debe ser uno de ${ROLES.join(', ')}.`);

    const existing = await prisma.user.findUnique({ where: { userId } });
    if (existing && !flags.reset) {
      throw new Error(
        `El usuario "${userId}" ya existe (rol ${existing.role}, ${existing.activo ? 'activo' : 'desactivado'}). ` +
          'Usa --reset para restablecer su contraseña y reactivarlo.',
      );
    }

    let password = flags.password;
    let generated = false;

    if (flags.passwordStdin) {
      if (password) throw new Error('Usa --password o --password-stdin, no ambos.');
      password = await readStdin();
      if (!password) throw new Error('No se recibió ninguna contraseña por la entrada estándar.');
    }

    if (!password) {
      password = generatePassword();
      generated = true;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    const data = {
      nombre: flags.name ?? existing?.nombre ?? '',
      password: await hashPassword(password),
      role,
      activo: true,
    };

    await prisma.user.upsert({ where: { userId }, create: { userId, ...data }, update: data });

    console.log(`${existing ? 'Actualizado' : 'Creado'}: ${userId} (rol ${role}, activo).`);
    if (generated) {
      console.log('');
      console.log(`  Contraseña: ${password}`);
      console.log('');
      console.log('  Se muestra una sola vez: no queda guardada en texto plano en ninguna parte.');
      console.log('  Anótala ahora y cámbiala desde Mantenimiento > Usuarios tras el primer ingreso.');
    }

    const admins = await prisma.user.count({ where: { role: 'admin', activo: true } });
    console.log(`Administradores activos: ${admins}.`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
