import { buildTicketBuffer } from '@/lib/thermal-printer';

/**
 * El ticket térmico se manda como bytes ESC/POS, así que lo que se puede verificar
 * aquí es el contenido decodificado: que salgan las dos copias en el mismo trabajo,
 * con el mismo correlativo interno, y que cada una traiga su corte de papel.
 */

const DATOS = {
  company: { nombre: 'Beneficio Germania', rtn: '0801-1990-123456', telefono: '2222-3333', direccion: 'Santa Bárbara' },
  businessDate: '2026-09-27',
  sucursalNombre: 'Bodega San Juan',
  clientNombre: 'Juan Pérez',
  numeroInterno: 'C-000123',
  items: [{ productoNombre: 'Pergamino seco', libras: 1137, precioPorLibra: 22, total: 25014 }],
  total: 25014,
};

/** Corte de papel ESC/POS (`GS V 0`). */
const CORTE = Buffer.from([0x1d, 0x56, 0x00]);

function ocurrencias(texto: string, buscado: string) {
  return texto.split(buscado).length - 1;
}

describe('buildTicketBuffer — copias', () => {
  const texto = buildTicketBuffer(DATOS).toString('latin1');

  it('imprime una copia para el cliente y otra para el control interno', () => {
    expect(ocurrencias(texto, '*** CLIENTE ***')).toBe(1);
    expect(ocurrencias(texto, '*** CONTROL INTERNO ***')).toBe(1);
  });

  it('las dos copias llevan el mismo correlativo interno y el mismo total', () => {
    expect(ocurrencias(texto, 'No. C-000123')).toBe(2);
    expect(ocurrencias(texto, 'TOTAL: L 25014.00')).toBe(2);
  });

  // Sin el segundo corte las dos copias salen pegadas en una sola tira de papel.
  it('corta el papel al final de cada copia', () => {
    expect(ocurrencias(texto, CORTE.toString('latin1'))).toBe(2);
  });

  it('omite el renglón del correlativo cuando no se le pasa', () => {
    const sinNumero = buildTicketBuffer({ ...DATOS, numeroInterno: undefined }).toString('latin1');
    expect(sinNumero).not.toContain('No. ');
    // Las copias siguen siendo dos: el rótulo no depende del correlativo.
    expect(ocurrencias(sinNumero, '*** CLIENTE ***')).toBe(1);
  });
});
