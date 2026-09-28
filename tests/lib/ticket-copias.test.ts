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

  // Mismo criterio que la factura A4: en la compra la tara ya explica el descuento.
  it('no imprime el conteo de sacos en una compra, y sí en una venta', () => {
    const pesaje = { pesoBruto: 1200, numeroSacos: 4, taraTotal: 63 };
    const linea = { ...DATOS.items[0], ...pesaje };

    const compra = buildTicketBuffer({ ...DATOS, kind: 'compra', items: [linea] }).toString('latin1');
    expect(compra).toContain('Tara 63.00lb');
    expect(compra).not.toContain('sacos');

    const venta = buildTicketBuffer({ ...DATOS, kind: 'venta', items: [linea] }).toString('latin1');
    expect(venta).toContain('Tara 63.00lb (4 sacos)');
  });

  // Sin documento fiscal el ticket no puede pasar por factura, igual que la hoja A4.
  it('sin documento se rotula como comprobante interno', () => {
    expect(texto).toContain('COMPROBANTE INTERNO');
    expect(texto).not.toContain('CAI:');
  });

  it('omite el renglón del correlativo cuando no se le pasa', () => {
    const sinNumero = buildTicketBuffer({ ...DATOS, numeroInterno: undefined }).toString('latin1');
    expect(sinNumero).not.toContain('No. ');
    // Las copias siguen siendo dos: el rótulo no depende del correlativo.
    expect(ocurrencias(sinNumero, '*** CLIENTE ***')).toBe(1);
  });
});

/**
 * El ticket de 80 mm y la hoja A4 son **el mismo documento** en dos formatos, así que
 * el ticket tiene que llevar lo mismo: número fiscal, CAI, las dos fechas y el
 * desglose.
 */
describe('buildTicketBuffer — documento fiscal', () => {
  const DOCUMENTO = {
    id: 'fd_1',
    numeroCompleto: '001-001-04-00000123',
    tipoDocumentoLabel: 'Boleta de compra',
    estado: 'emitido',
    fechaEmision: '2026-09-28',
    cai: { codigo: 'ABCD-1234-EFGH', rangoDesde: 1, rangoHasta: 500, fechaLimite: '2027-12-31' },
    desglose: {
      importeExento: 25_014,
      importeExonerado: 0,
      importeGravado15: 0,
      importeGravado18: 0,
      isv15: 0,
      isv18: 0,
    },
    anulacionMotivo: null as string | null,
  };

  const conDocumento = (extra: Partial<typeof DOCUMENTO> = {}) =>
    buildTicketBuffer({
      ...DATOS,
      kind: 'compra',
      businessDate: '2026-09-20',
      documento: { ...DOCUMENTO, ...extra },
    }).toString('latin1');

  it('imprime el número fiscal, el CAI y las dos fechas', () => {
    const texto = conDocumento();

    expect(texto).toContain('No. 001-001-04-00000123');
    expect(texto).toContain('CAI: ABCD-1234-EFGH');
    expect(texto).toContain('Limite emision: 2027-12-31');
    expect(texto).toContain('Emitida: 2026-09-28');
    expect(texto).toContain('Fecha compra: 2026-09-20');
    expect(texto).not.toContain('COMPROBANTE INTERNO');
    // El correlativo interno sigue saliendo, ahora rotulado.
    expect(texto).toContain('Control interno C-000123');
  });

  it('el rango del CAI sale con los ocho dígitos, partido en dos líneas', () => {
    const texto = conDocumento();
    expect(texto).toContain('Rango: 00000001 a');
    expect(texto).toContain('00000500');
  });

  it('imprime el desglose, y solo los renglones que aplican', () => {
    const texto = conDocumento();
    expect(texto).toContain('Importe exento:');
    expect(texto).not.toContain('ISV 15%');

    const gravado = conDocumento({
      desglose: { ...DOCUMENTO.desglose, importeExento: 0, importeGravado15: 86.96, isv15: 13.04 },
    });
    expect(gravado).toContain('Gravado 15%:');
    expect(gravado).toContain('ISV 15%:');
  });

  it('un documento anulado lo dice con su motivo', () => {
    const texto = conDocumento({ estado: 'anulado', anulacionMotivo: 'Cliente equivocado' });
    expect(texto).toContain('*** ANULADO ***');
    expect(texto).toContain('Cliente equivocado');
  });

  it('el título es el tipo de documento fiscal, no el genérico', () => {
    expect(conDocumento()).toContain('Boleta de compra');
  });

  // El molido se cobra por el servicio y no a un precio por libra.
  it('omite el precio por libra cuando no hay', () => {
    const texto = buildTicketBuffer({
      ...DATOS,
      kind: 'molido',
      items: [{ productoNombre: 'Servicio de molido', libras: 50, precioPorLibra: 0, total: 100 }],
      total: 100,
    }).toString('latin1');

    expect(texto).toContain('50.00 lb');
    expect(texto).not.toContain('x L0.00');
  });
});
