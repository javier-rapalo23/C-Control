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

  // Los siete renglones salen siempre, aunque vayan en cero: el formato del SAR los
  // lleva preimpresos (requisito de la contadora del 29/09/2026).
  it('imprime los siete renglones del desglose, incluso en cero', () => {
    const texto = conDocumento();

    for (const etiqueta of [
      'Importe exento:',
      'Importe exonerado:',
      'Gravado 15%:',
      'ISV 15%:',
      'Gravado 18%:',
      'ISV 18%:',
    ]) {
      expect(texto).toContain(etiqueta);
    }
    // Los que no aplican salen en cero, no ausentes.
    expect(texto).toContain('ISV 15%:');
    expect(texto).toMatch(/ISV 15%:\s+L 0\.00/);
    expect(texto).toContain('TOTAL: L 25014.00');

    const gravado = conDocumento({
      desglose: { ...DOCUMENTO.desglose, importeExento: 0, importeGravado15: 86.96, isv15: 13.04 },
    });
    expect(gravado).toMatch(/Gravado 15%:\s+L 86\.96/);
    expect(gravado).toMatch(/ISV 15%:\s+L 13\.04/);
  });

  // 32 columnas: un renglón más largo se parte y deja el monto en otra línea.
  it('ningún renglón del desglose pasa de 32 columnas', () => {
    const lineas = conDocumento()
      .split('\n')
      .filter((linea) => /Importe |Gravado |ISV /.test(linea));

    // Seis renglones en cada una de las dos copias.
    expect(lineas.length).toBe(12);
    for (const linea of lineas) expect(linea.length).toBeLessThanOrEqual(32);
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

/**
 * Nota de crédito o débito en 80 mm. Es el mismo documento que la hoja A4, así que tiene
 * que llevar a qué factura corresponde: sin eso, el papel no se puede emparejar con el
 * que corrige.
 */
describe('buildTicketBuffer — nota', () => {
  const MOTIVO = 'Se devolvieron 200 libras de pergamino por exceso de humedad en la bodega';

  const nota = (extra: Record<string, unknown> = {}) =>
    buildTicketBuffer({
      ...DATOS,
      kind: 'nota',
      numeroInterno: undefined,
      businessDate: '2026-09-28',
      items: [{ productoNombre: MOTIVO, libras: 0, precioPorLibra: 0, total: 500 }],
      total: 500,
      documento: {
        numeroCompleto: '001-001-03-00000007',
        tipoDocumentoLabel: 'Nota de crédito',
        estado: 'emitido',
        fechaEmision: '2026-09-28',
        cai: { codigo: 'NC-1234', rangoDesde: 1, rangoHasta: 200, fechaLimite: '2027-12-31' },
        desglose: {
          importeExento: 500,
          importeExonerado: 0,
          importeGravado15: 0,
          importeGravado18: 0,
          isv15: 0,
          isv18: 0,
        },
        anulacionMotivo: null,
        notaMotivo: MOTIVO,
        documentoOrigen: {
          numeroCompleto: '001-001-01-00000123',
          tipoDocumentoLabel: 'Factura',
          fechaEmision: '2026-09-20',
        },
        ...extra,
      },
    }).toString('latin1');

  it('dice qué documento modifica, con su número y su fecha', () => {
    const texto = nota();

    expect(texto).toContain('Nota de crédito');
    expect(texto).toContain('Modifica Factura');
    expect(texto).toContain('No. 001-001-01-00000123');
    expect(texto).toContain('del 2026-09-20');
  });

  // El concepto es texto libre que escribe una persona: en la térmica no hay ajuste
  // automático y lo que pasa de 32 columnas se pierde.
  it('envuelve el concepto en líneas de 32 columnas', () => {
    const lineas = nota()
      .split('\n')
      .filter((linea) => linea.includes('humedad') || linea.includes('devolvieron'));

    expect(lineas.length).toBeGreaterThan(1);
    for (const linea of lineas) expect(linea.length).toBeLessThanOrEqual(32);
  });

  // Una nota no tiene libras ni precio por libra: lo que se corrige es dinero.
  it('no imprime pesaje ni precio por libra', () => {
    const texto = nota();

    expect(texto).not.toContain('0.00 lb');
    expect(texto).not.toContain('x L0.00');
    expect(texto).toContain('L 500.00');
  });

  it('no despide con "gracias por su visita"', () => {
    expect(nota()).not.toContain('Gracias por su visita');
  });
});

/** El bloque del exonerado también va en 80 mm: los dos formatos son el mismo documento. */
describe('buildTicketBuffer — adquiriente exonerado', () => {
  const ticket = (extra: Record<string, unknown>) =>
    buildTicketBuffer({
      ...DATOS,
      kind: 'venta',
      clientRtn: '0801-1990-999999',
      ...extra,
    }).toString('latin1');

  it('no imprime el bloque cuando no hay exoneración', () => {
    expect(ticket({})).not.toContain('ADQUIRIENTE EXONERADO');
  });

  it('imprime la constancia del cliente y la orden de compra exenta', () => {
    const texto = ticket({
      registroExonerado: 'REG-EXO-4455',
      documento: {
        numeroCompleto: '001-001-01-00000045',
        tipoDocumentoLabel: 'Factura',
        estado: 'emitido',
        fechaEmision: '2026-09-29',
        cai: { codigo: 'ABCD-1234', rangoDesde: 1, rangoHasta: 500, fechaLimite: '2027-12-31' },
        desglose: {
          importeExento: 25_014,
          importeExonerado: 0,
          importeGravado15: 0,
          importeGravado18: 0,
          isv15: 0,
          isv18: 0,
        },
        anulacionMotivo: null,
        ordenCompraExenta: 'OC-2026-118',
      },
    });

    expect(texto).toContain('ADQUIRIENTE EXONERADO');
    expect(texto).toContain('REG-EXO-4455');
    expect(texto).toContain('OC-2026-118');
    // "RTN cliente" y no "RTN": el de la empresa ya salió en el encabezado.
    expect(texto).toContain('RTN cliente: 0801-1990-999999');
  });
});

/**
 * Ancho del papel. La térmica no ajusta: lo que pasa de 32 columnas se pierde, y en un
 * documento fiscal una razón social o un monto cortado a la mitad es un defecto.
 */
describe('buildTicketBuffer — ancho de 32 columnas', () => {
  it('ninguna línea se pasa del ancho, ni con nombre largo y desglose completo', () => {
    const texto = buildTicketBuffer({
      ...DATOS,
      kind: 'venta',
      clientNombre: 'Exportadora de Café del Norte de Honduras S. de R.L. de C.V.',
      clientRtn: '0801-1995-777777',
      registroExonerado: 'REG-EXO-4455-2026',
      items: [
        {
          ...DATOS.items[0],
          pesoBruto: 1200,
          numeroSacos: 4,
          taraTotal: 63,
          quintalesOro: 6.14,
        },
      ],
      documento: {
        numeroCompleto: '001-001-01-00000045',
        tipoDocumentoLabel: 'Factura',
        estado: 'emitido',
        fechaEmision: '2026-09-29',
        cai: { codigo: 'ABCD-1234-EFGH-5678', rangoDesde: 1, rangoHasta: 500, fechaLimite: '2027-12-31' },
        desglose: {
          importeExento: 0,
          importeExonerado: 25_014,
          importeGravado15: 0,
          importeGravado18: 0,
          isv15: 0,
          isv18: 0,
        },
        anulacionMotivo: null,
        ordenCompraExenta: 'OC-2026-118',
      },
    }).toString('latin1');

    // Se quitan los comandos ESC/POS: no ocupan columnas en el papel.
    const lineas = texto
      .replace(/\u001b[@!aE][\u0000-\u0002]?/g, '')
      .replace(/\u001d[V][\u0000]?/g, '')
      .split('\n');

    for (const linea of lineas) expect(linea.length).toBeLessThanOrEqual(32);
    // Y el nombre largo sale completo: se reparte en varias líneas, no se corta. Al
    // volver a unirlas con un espacio tiene que aparecer entero.
    expect(lineas.join(' ')).toContain('Exportadora de Café del Norte de Honduras S. de R.L. de C.V.');
  });
});
