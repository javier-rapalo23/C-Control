import { findDbUser, getAuthUserConfig, parseAuthUsers, resolveUserConfig } from '@/lib/auth';

/**
 * Doble mínimo de Prisma: solo `user.findUnique`, que es lo único que consulta
 * `findDbUser`. Devolver `undefined` como fila no encontrada replica a Prisma.
 */
function prismaStub(row: { password: string; role: string; activo: boolean } | null) {
  return { user: { findUnique: jest.fn().mockResolvedValue(row) } };
}

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  // `NODE_ENV` es readonly en los tipos de Node; en pruebas hay que forzarlo.
  (process.env as Record<string, string>).NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(originalNodeEnv ?? 'test');
});

describe('parseAuthUsers — cuentas de respaldo', () => {
  it('fuera de producción, sin variable, ofrece las cuentas de prueba', () => {
    setNodeEnv('development');
    expect(Object.keys(parseAuthUsers(undefined)).sort()).toEqual(['comprador1', 'consulta1', 'operador1']);
  });

  it('en producción, sin variable, no ofrece ninguna cuenta', () => {
    setNodeEnv('production');
    expect(parseAuthUsers(undefined)).toEqual({});
  });

  it('en producción, con la variable vacía, no ofrece ninguna cuenta', () => {
    setNodeEnv('production');
    expect(parseAuthUsers('')).toEqual({});
    expect(parseAuthUsers('   ')).toEqual({});
  });

  it('en producción, con un JSON inválido, falla cerrado en vez de caer a las cuentas de prueba', () => {
    setNodeEnv('production');
    expect(parseAuthUsers('{no es json')).toEqual({});
    expect(parseAuthUsers('["operador1"]')).toEqual({});
    expect(parseAuthUsers('null')).toEqual({});
  });

  it('respeta un JSON vacío como "sin cuentas de respaldo", también en desarrollo', () => {
    setNodeEnv('development');
    expect(parseAuthUsers('{}')).toEqual({});
  });

  it('descarta las entradas con rol inválido sin reactivar las cuentas de prueba', () => {
    setNodeEnv('development');
    expect(parseAuthUsers('{"alguien":{"role":"superadmin","password":"x"}}')).toEqual({});
  });

  it('acepta la forma corta (solo rol) y la forma con contraseña', () => {
    expect(parseAuthUsers('{"a":"viewer","b":{"role":"admin","password":"secreta"}}')).toEqual({
      a: { role: 'viewer' },
      b: { role: 'admin', password: 'secreta' },
    });
  });

  it('getAuthUserConfig no encuentra las cuentas de prueba en producción', () => {
    setNodeEnv('production');
    expect(getAuthUserConfig('operador1', undefined)).toBeNull();
  });
});

describe('findDbUser', () => {
  it('distingue ausente, desactivado y activo', async () => {
    await expect(findDbUser('x', prismaStub(null))).resolves.toEqual({ status: 'missing' });
    await expect(
      findDbUser('x', prismaStub({ password: 'p', role: 'admin', activo: false })),
    ).resolves.toEqual({ status: 'inactive' });
    await expect(
      findDbUser('x', prismaStub({ password: 'p', role: 'admin', activo: true })),
    ).resolves.toEqual({ status: 'active', config: { role: 'admin', password: 'p' } });
  });

  it('propaga los errores de base de datos en vez de tragárselos', async () => {
    const failing = { user: { findUnique: jest.fn().mockRejectedValue(new Error('sin conexión')) } };
    await expect(findDbUser('x', failing)).rejects.toThrow('sin conexión');
  });
});

describe('resolveUserConfig', () => {
  const envUsers = '{"operador1":{"role":"editor","password":"operador123"}}';

  it('prefiere la tabla User sobre el respaldo de entorno', async () => {
    const prisma = prismaStub({ password: 'hash', role: 'admin', activo: true });
    await expect(resolveUserConfig('operador1', prisma, envUsers)).resolves.toEqual({
      source: 'db',
      config: { role: 'admin', password: 'hash' },
    });
  });

  it('usa el respaldo de entorno solo si el usuario no existe en la base', async () => {
    await expect(resolveUserConfig('operador1', prismaStub(null), envUsers)).resolves.toEqual({
      source: 'env',
      config: { role: 'editor', password: 'operador123' },
    });
  });

  it('un usuario desactivado no recupera acceso por el respaldo de entorno', async () => {
    const prisma = prismaStub({ password: 'hash', role: 'admin', activo: false });
    await expect(resolveUserConfig('operador1', prisma, envUsers)).resolves.toBeNull();
  });

  it('devuelve null cuando no está ni en la base ni en el entorno', async () => {
    setNodeEnv('production');
    await expect(resolveUserConfig('fantasma', prismaStub(null), undefined)).resolves.toBeNull();
  });

  it('un error de base de datos no concede acceso por el respaldo de entorno', async () => {
    const failing = { user: { findUnique: jest.fn().mockRejectedValue(new Error('sin conexión')) } };
    await expect(resolveUserConfig('operador1', failing, envUsers)).rejects.toThrow('sin conexión');
  });
});
