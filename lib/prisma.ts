import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    // Cada escritura recalcula el saldo del día dentro de la transacción: una
    // docena de consultas que, en una transacción interactiva, van una tras otra
    // por la misma conexión. Contra la base remota eso pasaba de los 5 s por
    // defecto y la operación entera se perdía.
    transactionOptions: {
      maxWait: 10_000,
      timeout: 20_000,
    },
  });

globalForPrisma.prisma = prisma;