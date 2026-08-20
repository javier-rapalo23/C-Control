import { createSessionToken, readSessionToken, verifySessionToken } from '@/lib/session';

function tokenRequest(headers: Record<string, string>, cookies: Record<string, string>) {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    cookies: { get: (name: string) => (cookies[name] ? { value: cookies[name] } : undefined) },
  };
}

describe('createSessionToken / verifySessionToken', () => {
  it('firma y recupera el usuario y su rol', async () => {
    const token = await createSessionToken('admin1', 'admin');
    const payload = await verifySessionToken(token);

    expect(payload?.userId).toBe('admin1');
    expect(payload?.role).toBe('admin');
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('conserva caracteres no ASCII en el userId', async () => {
    const token = await createSessionToken('pruebas@javierorellana.dev', 'viewer');
    await expect(verifySessionToken(token)).resolves.toMatchObject({ userId: 'pruebas@javierorellana.dev' });
  });

  it('rechaza un payload manipulado para escalar privilegios', async () => {
    const token = (await createSessionToken('visualizador', 'viewer'))!;
    const [, signature] = token.split('.');

    // Se reemplaza el cuerpo por uno que dice `admin`, conservando la firma original.
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: 'visualizador', role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');

    await expect(verifySessionToken(`${forgedBody}.${signature}`)).resolves.toBeNull();
  });

  it('rechaza un userId inventado sin firma válida', async () => {
    const body = Buffer.from(
      JSON.stringify({ userId: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');

    await expect(verifySessionToken(`${body}.firma-inventada`)).resolves.toBeNull();
  });

  it('rechaza el formato legacy de cookie (userId en texto plano)', async () => {
    await expect(verifySessionToken('admin')).resolves.toBeNull();
  });

  it('rechaza tokens expirados, vacíos o mal formados', async () => {
    await expect(verifySessionToken(null)).resolves.toBeNull();
    await expect(verifySessionToken('')).resolves.toBeNull();
    await expect(verifySessionToken('sin-punto')).resolves.toBeNull();
    await expect(verifySessionToken('.solo-firma')).resolves.toBeNull();

    const expired = await createSessionToken('admin1', 'admin');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await expect(verifySessionToken(expired)).resolves.toBeNull();
  });
});

describe('readSessionToken', () => {
  it('prefiere Authorization: Bearer sobre la cookie', () => {
    const request = tokenRequest({ authorization: 'Bearer token-header' }, { rcontrol_user: 'token-cookie' });
    expect(readSessionToken(request)).toBe('token-header');
  });

  it('cae a la cookie cuando no hay cabecera', () => {
    expect(readSessionToken(tokenRequest({}, { rcontrol_user: 'token-cookie' }))).toBe('token-cookie');
  });

  it('ignora la cabecera x-user-id, que ya no autentica', () => {
    expect(readSessionToken(tokenRequest({ 'x-user-id': 'admin' }, {}))).toBeNull();
  });
});
