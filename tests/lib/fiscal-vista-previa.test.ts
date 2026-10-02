jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import type { PrismaClient } from '@prisma/client';
import { vistaPreviaDocumentoFiscal } from '@/lib/fiscal-document';

/**
 * La vista previa de la boleta dice qué número llevaría y si se va a poder emitir, sin
 * bloquear ni consumir el CAI. Se prueba contra un doble de la base: lo único que lee
 * es el CAI activo del tipo.
 */

function cai(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cai_1',
    codigo: 'ABC123-DEF456',
    tipoDocumento: 'boleta_compra',
    codigoEstablecimiento: '001',
    codigoPuntoEmision: '001',
    codigoTipoDocumento: '04',
    rangoDesde: 1,
    rangoHasta: 500,
    fechaLimite: new Date('2099-12-31T00:00:00.000Z'),
    modo: 'SISTEMA',
    estado: 'activo',
    ultimoCorrelativo: 41,
    alertaPorcentaje: 80,
    alertaDiasPrevios: 30,
    ...overrides,
  };
}

function dbCon(fila: unknown) {
  const findFirst = jest.fn().mockResolvedValue(fila);
  return { db: { fiscalCai: { findFirst } } as unknown as PrismaClient, findFirst };
}

const LINEAS = [{ monto: 25014, clasificacionFiscal: 'EXENTO' }];

describe('vistaPreviaDocumentoFiscal', () => {
  it('muestra el próximo número del CAI en modo sistema', async () => {
    const { db, findFirst } = dbCon(cai());
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25014);

    expect(findFirst).toHaveBeenCalledWith({ where: { tipoDocumento: 'boleta_compra', estado: 'activo' } });
    expect(vista.motivoNoEmite).toBeNull();
    expect(vista.documento?.numeroCompleto).toBe('001-001-04-00000042');
    expect(vista.documento?.cai).toEqual({
      codigo: 'ABC123-DEF456',
      rangoDesde: 1,
      rangoHasta: 500,
      fechaLimite: '2099-12-31',
    });
  });

  // Igual que al emitir: el bono y el descuento se cargan al exento para que el
  // desglose cuadre con el total impreso.
  it('ajusta el desglose al total que se paga', async () => {
    const { db } = dbCon(cai());
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25514);

    expect(vista.documento?.desglose.importeExento).toBe(25514);
    expect(vista.documento?.desglose.isv15).toBe(0);
  });

  it('sin CAI activo no emite y dice por qué', async () => {
    const { db } = dbCon(null);
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25014);

    expect(vista.documento).toBeNull();
    expect(vista.motivoNoEmite).toMatch(/No hay un CAI activo/);
  });

  // En talonario el número lo trae el papel: no hay cómo emitir al guardar.
  it('en modo talonario no emite', async () => {
    const { db } = dbCon(cai({ modo: 'TALONARIO' }));
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25014);

    expect(vista.documento).toBeNull();
    expect(vista.motivoNoEmite).toMatch(/talonario/);
  });

  it('con el CAI vencido no emite', async () => {
    const { db } = dbCon(cai({ fechaLimite: new Date('2000-01-01T00:00:00.000Z') }));
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25014);

    expect(vista.documento).toBeNull();
    expect(vista.motivoNoEmite).toMatch(/fecha límite/);
  });

  it('con el rango agotado no emite', async () => {
    const { db } = dbCon(cai({ ultimoCorrelativo: 500 }));
    const vista = await vistaPreviaDocumentoFiscal(db, 'compra', LINEAS, 25014);

    expect(vista.documento).toBeNull();
    expect(vista.motivoNoEmite).toMatch(/agotado/);
  });
});
