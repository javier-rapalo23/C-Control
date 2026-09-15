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
  it('crea el tipo y deriva la categoría del catálogo', async () => {
    mockedPrisma.producto.create.mockResolvedValue({
      id: 'prod_1',
      nombre: 'Pergamino seco',
      categoria: 'pergamino',
      taraPorSaco: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const request = new Request('http://localhost/api/productos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // La petición no manda categoría: la pone el catálogo.
      body: JSON.stringify({ nombre: 'Pergamino seco' }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; data: { nombre: string; categoria: string; facturable: boolean } };

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.nombre).toBe('Pergamino seco');
    expect(body.data.categoria).toBe('pergamino');
    expect(body.data.facturable).toBe(true);
    expect(mockedPrisma.producto.create).toHaveBeenCalledWith({
      data: { nombre: 'Pergamino seco', categoria: 'pergamino', taraPorSaco: undefined },
    });
  });

  it('marca como no facturable lo que no es uva ni pergamino', async () => {
    mockedPrisma.producto.create.mockResolvedValue({
      id: 'prod_2',
      nombre: 'Guacuco',
      categoria: 'otros',
      taraPorSaco: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const request = new Request('http://localhost/api/productos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Guacuco' }),
    });

    const body = (await (await POST(request)).json()) as { data: { facturable: boolean } };

    expect(body.data.facturable).toBe(false);
  });

  // El catálogo es cerrado: si esto pasara, dos sucursales podrían inventar
  // nombres distintos para el mismo café y los acumulados de temporada no
  // cuadrarían.
  it('rechaza un nombre que no está en el catálogo', async () => {
    const request = new Request('http://localhost/api/productos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Pergamino Seco de la finca' }),
    });

    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockedPrisma.producto.create).not.toHaveBeenCalled();
  });
});
