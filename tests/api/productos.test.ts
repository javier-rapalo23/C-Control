jest.mock('@/lib/prisma', () => ({
  prisma: {
    producto: {
      create: jest.fn(),
    },
  },
}));

import { POST } from '@/app/api/productos/route';
import { prisma } from '@/lib/prisma';

const mockedPrisma = prisma as unknown as {
  producto: {
    create: jest.Mock;
  };
};

describe('POST /api/productos', () => {
  it('creates producto and returns 201', async () => {
    mockedPrisma.producto.create.mockResolvedValue({
      id: 'prod_1',
      nombre: 'Cobre',
      precioPorLibra: 4.25,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const request = new Request('http://localhost/api/productos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Cobre', precioPorLibra: 4.25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; data: { nombre: string } };

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.nombre).toBe('Cobre');
    expect(mockedPrisma.producto.create).toHaveBeenCalledTimes(1);
  });
});
