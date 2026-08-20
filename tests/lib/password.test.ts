import { hashPassword, isHashed, needsRehash, verifyPassword } from '@/lib/password';

describe('hashPassword', () => {
  it('produce el formato scrypt esperado', async () => {
    const stored = await hashPassword('operador123');
    const [scheme, salt, derived] = stored.split('$');

    expect(scheme).toBe('scrypt');
    expect(salt).toHaveLength(32);
    expect(derived).toHaveLength(128);
    expect(isHashed(stored)).toBe(true);
  });

  it('usa una sal distinta en cada llamada', async () => {
    const [first, second] = await Promise.all([hashPassword('misma'), hashPassword('misma')]);
    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  it('acepta la contraseña correcta', async () => {
    const stored = await hashPassword('operador123');
    await expect(verifyPassword('operador123', stored)).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const stored = await hashPassword('operador123');
    await expect(verifyPassword('operador124', stored)).resolves.toBe(false);
  });

  it('rechaza entradas vacías y hashes malformados', async () => {
    const stored = await hashPassword('operador123');
    await expect(verifyPassword('', stored)).resolves.toBe(false);
    await expect(verifyPassword('operador123', '')).resolves.toBe(false);
    await expect(verifyPassword('operador123', 'scrypt$solo-sal')).resolves.toBe(false);
  });

  it('sigue validando contraseñas legacy en texto plano', async () => {
    await expect(verifyPassword('operador123', 'operador123')).resolves.toBe(true);
    await expect(verifyPassword('otra', 'operador123')).resolves.toBe(false);
  });
});

describe('needsRehash', () => {
  it('marca solo los valores legacy', async () => {
    expect(needsRehash('operador123')).toBe(true);
    expect(needsRehash(await hashPassword('operador123'))).toBe(false);
  });
});
