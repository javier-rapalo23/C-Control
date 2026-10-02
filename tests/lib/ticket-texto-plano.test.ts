import { buildTicketBuffer, ticketTextoPlano } from '@/lib/thermal-printer';

/**
 * El texto del ticket es lo que se muestra en la vista previa de la compra. Sale de los
 * mismos bytes que van a la térmica, así que lo que importa es que no queden comandos
 * ESC/POS sueltos y que diga lo mismo que el papel.
 */

const DATOS = {
  company: { nombre: 'Beneficio Germania', rtn: '0801-1990-123456', telefono: '2222-3333', direccion: 'Santa Bárbara' },
  businessDate: '2026-09-27',
  sucursalNombre: 'Bodega San Juan',
  clientNombre: 'Juan Pérez',
  numeroInterno: 'C-000123',
  kind: 'compra' as const,
  items: [{ productoNombre: 'Pergamino seco', libras: 1137, precioPorLibra: 22, total: 25014 }],
  total: 25014,
};

describe('ticketTextoPlano', () => {
  const texto = ticketTextoPlano(DATOS);

  it('no deja comandos ESC/POS en el texto', () => {
    expect(texto).not.toMatch(/[\x1b\x1d]/);
  });

  // Las dos copias son el mismo documento: en pantalla basta con una.
  it('muestra solo la copia del cliente', () => {
    expect(texto).toContain('*** CLIENTE ***');
    expect(texto).not.toContain('CONTROL INTERNO ***');
  });

  it('trae lo mismo que el papel: número, línea y total', () => {
    const papel = buildTicketBuffer(DATOS).toString('latin1');
    for (const fragmento of ['No. C-000123', 'Pergamino seco', 'TOTAL: L 25014.00']) {
      expect(texto).toContain(fragmento);
      expect(papel).toContain(fragmento);
    }
  });

  it('respeta las 32 columnas y centra lo que la impresora centra', () => {
    const lineas = texto.split('\n');
    expect(Math.max(...lineas.map((linea) => linea.length))).toBeLessThanOrEqual(32);
    // El nombre de la empresa va centrado: 18 caracteres en 32 dejan 7 de margen.
    expect(lineas[0]).toBe(`${' '.repeat(7)}Beneficio Germania`);
  });

  it('no termina en líneas vacías', () => {
    expect(texto.endsWith('\n')).toBe(false);
    expect(texto.split('\n').at(-1)).not.toBe('');
  });
});
