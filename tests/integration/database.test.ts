import { prisma } from '@/lib/prisma';

/**
 * Comprueba el arnés de integración antes de que alguna fase dependa de él: que la
 * base de pruebas responda y que tenga las migraciones aplicadas.
 *
 * Sin `TEST_DATABASE_URL` en `.env.test` la suite se **salta**, para que
 * `pnpm test` siga verde en una máquina sin base de pruebas configurada.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

conBase('base de datos de pruebas', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responde a una consulta', async () => {
    const resultado = await prisma.$queryRaw<Array<{ uno: number }>>`SELECT 1 AS uno`;
    expect(resultado[0].uno).toBe(1);
  });

  it('tiene las migraciones aplicadas', async () => {
    const pendientes = await prisma.$queryRaw<Array<{ nombre: string }>>`
      SELECT "migration_name" AS nombre
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NULL
    `;
    expect(pendientes).toHaveLength(0);
  });

  // Si esta consulta falla, la base de pruebas está vieja: falta correr
  // `pnpm test:db:migrate`.
  it('conoce las tablas que usan las pruebas', async () => {
    await expect(prisma.sucursal.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.purchaseTransaction.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
