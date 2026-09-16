jest.mock('@/lib/prisma', () => ({
  prisma: {
    purchaseTransaction: { findUnique: jest.fn() },
    saleTransaction: { findUnique: jest.fn() },
    companySettings: { upsert: jest.fn() },
  },
}));

import { buildInvoiceForPurchase, buildInvoiceForSale } from '@/lib/build-invoice';
import { prisma } from '@/lib/prisma';

const mocked = prisma as unknown as {
  purchaseTransaction: { findUnique: jest.Mock };
  saleTransaction: { findUnique: jest.Mock };
  companySettings: { upsert: jest.Mock };
};

const EMPRESA_SIN_CAI = {
  nombre: 'Beneficio Germania',
  rtn: '0801-1990-123456',
  telefono: '2222-3333',
  direccion: 'Santa Bárbara',
  email: '',
  cai: '',
  facturaRangoDesde: '',
  facturaRangoHasta: '',
  facturaFechaLimite: '',
};

function compra(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pt_1',
    businessDate: new Date('2026-09-14T00:00:00.000Z'),
    metodoPago: 'efectivo',
    numeroFactura: '00123',
    total: 25014,
    sucursal: { nombre: 'Bodega San Juan' },
    client: {
      nombre: 'Juan Pérez',
      rtn: null,
      telefono: null,
      direccion: null,
      claveIhcafe: '12345',
      nombreFinca: 'El Rosal',
    },
    items: [
      {
        productoNombre: 'Pergamino seco',
        pesoBruto: 1200,
        numeroSacos: 4,
        taraPorSaco: 15.75,
        libras: 1137,
        porcentajeOro: 54,
        quintalesOro: 4.91,
        precioPorLibra: 22,
        total: 25014,
      },
    ],
    ...overrides,
  };
}

describe('buildInvoiceForPurchase', () => {
  beforeEach(() => {
    mocked.companySettings.upsert.mockResolvedValue(EMPRESA_SIN_CAI);
  });

  it('devuelve null si la transacción no existe', async () => {
    mocked.purchaseTransaction.findUnique.mockResolvedValue(null);
    expect(await buildInvoiceForPurchase('no-existe')).toBeNull();
  });

  it('arma la factura con el pesaje completo y el folio del talonario', async () => {
    mocked.purchaseTransaction.findUnique.mockResolvedValue(compra());

    const data = await buildInvoiceForPurchase('pt_1');

    expect(data).not.toBeNull();
    expect(data!.kind).toBe('compra');
    expect(data!.numeroFactura).toBe('00123');
    expect(data!.businessDate).toBe('2026-09-14');
    expect(data!.metodoPago).toBe('Efectivo');
    expect(data!.cliente.nombreFinca).toBe('El Rosal');
    expect(data!.lineas[0]).toMatchObject({ pesoBruto: 1200, numeroSacos: 4, porcentajeOro: 54 });
    expect(data!.totalLibras).toBe(1137);
    expect(data!.totalQuintalesOro).toBe(4.91);
    expect(data!.total).toBe(25014);
  });

  // Un cero impreso se lee como "no rindió"; lo cierto es que aún no se sabe.
  it('deja el total de oro en null cuando ninguna línea trae rendimiento', async () => {
    mocked.purchaseTransaction.findUnique.mockResolvedValue(
      compra({
        items: [{ ...compra().items[0], porcentajeOro: null, quintalesOro: null }],
      }),
    );

    const data = await buildInvoiceForPurchase('pt_1');

    expect(data!.totalQuintalesOro).toBeNull();
    expect(data!.totalLibras).toBe(1137);
  });

  it('no arma bloque fiscal mientras el CAI esté vacío', async () => {
    mocked.purchaseTransaction.findUnique.mockResolvedValue(compra());
    const data = await buildInvoiceForPurchase('pt_1');
    expect(data!.empresa.fiscal).toBeNull();
  });

  // Activar la facturación autorizada es llenar los campos en Mantenimiento;
  // no debe hacer falta tocar código.
  it('arma el bloque fiscal en cuanto el CAI tiene valor', async () => {
    mocked.purchaseTransaction.findUnique.mockResolvedValue(compra());
    mocked.companySettings.upsert.mockResolvedValue({
      ...EMPRESA_SIN_CAI,
      cai: 'ABCD-1234-EFGH',
      facturaRangoDesde: '000-001-01-00000001',
      facturaRangoHasta: '000-001-01-00005000',
      facturaFechaLimite: '31/12/2027',
    });

    const data = await buildInvoiceForPurchase('pt_1');

    expect(data!.empresa.fiscal).toEqual({
      cai: 'ABCD-1234-EFGH',
      rangoDesde: '000-001-01-00000001',
      rangoHasta: '000-001-01-00005000',
      fechaLimite: '31/12/2027',
    });
  });
});

describe('buildInvoiceForSale', () => {
  beforeEach(() => {
    mocked.companySettings.upsert.mockResolvedValue(EMPRESA_SIN_CAI);
  });

  it('conserva el precio por quintal oro de una venta en modo oro', async () => {
    mocked.saleTransaction.findUnique.mockResolvedValue({
      id: 'st_1',
      businessDate: new Date('2026-09-14T00:00:00.000Z'),
      total: 34560,
      sucursal: { nombre: 'Bodega San Juan' },
      client: { nombre: 'Exportadora', rtn: null, telefono: null, direccion: null, claveIhcafe: null, nombreFinca: null },
      items: [
        {
          productoNombre: 'Pergamino seco',
          libras: 2500,
          porcentajeOro: 54,
          quintalesOro: 10.8,
          precioPorLibra: null,
          precioPorQuintalOro: 3200,
          descripcion: null,
          monto: 34560,
        },
      ],
    });

    const data = await buildInvoiceForSale('st_1');

    expect(data!.kind).toBe('venta');
    expect(data!.lineas[0].precioPorQuintalOro).toBe(3200);
    expect(data!.lineas[0].precioPorLibra).toBeNull();
    expect(data!.totalQuintalesOro).toBe(10.8);
    // §19.3 decidió el folio manual solo para compras.
    expect(data!.numeroFactura).toBeNull();
    expect(data!.metodoPago).toBeNull();
  });

  it('tolera una venta libre sin producto ni libras', async () => {
    mocked.saleTransaction.findUnique.mockResolvedValue({
      id: 'st_2',
      businessDate: new Date('2026-09-14T00:00:00.000Z'),
      total: 500,
      sucursal: { nombre: 'Bodega San Juan' },
      client: { nombre: 'General', rtn: null, telefono: null, direccion: null, claveIhcafe: null, nombreFinca: null },
      items: [
        {
          productoNombre: null,
          libras: null,
          porcentajeOro: null,
          quintalesOro: null,
          precioPorLibra: null,
          precioPorQuintalOro: null,
          descripcion: 'Venta de sacos vacíos',
          monto: 500,
        },
      ],
    });

    const data = await buildInvoiceForSale('st_2');

    expect(data!.lineas[0].productoNombre).toBe('Venta');
    expect(data!.lineas[0].descripcion).toBe('Venta de sacos vacíos');
    expect(data!.totalLibras).toBe(0);
    expect(data!.totalQuintalesOro).toBeNull();
    expect(data!.total).toBe(500);
  });
});
