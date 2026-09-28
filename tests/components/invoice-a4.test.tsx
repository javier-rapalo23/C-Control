import { renderToStaticMarkup } from 'react-dom/server';
import InvoiceA4 from '@/components/invoice-a4';
import type { InvoiceData } from '@/lib/build-invoice';

/**
 * La factura A4 la maqueta el navegador, no la impresora, así que lo que se puede
 * verificar aquí es el HTML: que los números lleguen formateados, que las columnas
 * del pie cuadren con las del encabezado y que el bloque fiscal solo aparezca
 * cuando hay CAI.
 */

const EMPRESA = {
  nombre: 'Beneficio Germania',
  rtn: '0801-1990-123456',
  telefono: '2222-3333',
  direccion: 'Santa Bárbara',
  email: '',
  fiscal: null,
};

const CLIENTE = {
  nombre: 'Juan Pérez',
  rtn: null,
  telefono: null,
  direccion: null,
  claveIhcafe: '12345',
  nombreFinca: 'El Rosal',
};

const COMPRA: InvoiceData = {
  kind: 'compra',
  titulo: 'Comprobante de Compra',
  numeroInterno: 'C-000123',
  numeroFactura: '00123',
  businessDate: '2026-09-14',
  sucursalNombre: 'Bodega San Juan',
  metodoPago: 'Efectivo',
  empresa: EMPRESA,
  cliente: CLIENTE,
  lineas: [
    {
      productoNombre: 'Pergamino seco',
      pesoBruto: 1200,
      numeroSacos: 4,
      taraPorSaco: 15.75,
      libras: 1137,
      porcentajeOro: 54,
      quintalesOro: 4.91,
      precioPorLibra: 22,
      precioPorQuintalOro: null,
      descripcion: null,
      total: 25014,
    },
  ],
  subtotal: 25014,
  bono: 0,
  bonoMotivo: null,
  descuento: 0,
  descuentoMotivo: null,
  total: 25014,
  totalLibras: 1137,
  totalQuintalesOro: 4.91,
};

/** Columnas de cada fila `<tr>`, contando el `colSpan`. */
function anchoDeFilas(html: string, etiqueta: 'th' | 'td'): number[] {
  const filas = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  return filas
    .filter((fila) => fila.includes(`<${etiqueta}`))
    .map((fila) => {
      const celdas = fila.match(new RegExp(`<${etiqueta}[^>]*>`, 'g')) ?? [];
      return celdas.reduce((total, celda) => {
        const colSpan = celda.match(/colspan="(\d+)"/i);
        return total + (colSpan ? Number(colSpan[1]) : 1);
      }, 0);
    });
}

describe('InvoiceA4 — compra', () => {
  const html = renderToStaticMarkup(<InvoiceA4 data={COMPRA} />);

  it('imprime el folio, la fecha en formato local y la sucursal', () => {
    expect(html).toContain('00123');
    expect(html).toContain('14/09/2026');
    expect(html).toContain('Bodega San Juan');
  });

  it('muestra la trazabilidad del pesaje que no cabe en el ticket térmico', () => {
    expect(html).toContain('Bruto (lb)');
    expect(html).toContain('Tara (lb)');
    expect(html).toContain('QQ oro');
    // Tara total = 15.75 x 4 sacos, calculada en la hoja y no guardada.
    expect(html).toContain('63.00');
  });

  // El productor recibe la cuenta de lo que se le paga: la tara ya dice cuánto se
  // descuenta del bruto, y el rendimiento es una estimación del beneficio.
  it('no imprime el conteo de sacos ni el rendimiento', () => {
    expect(html).not.toContain('Sacos');
    expect(html).not.toContain('Rend.');
    // El 54 % del rendimiento tampoco puede salir en ninguna celda.
    expect(html).not.toContain('54.00 %');
    // Los quintales oro sí: es la cifra con la que el productor compara.
    expect(html).toContain('4.91');
  });

  it('rotula al cliente como productor y muestra finca y clave IHCAFE', () => {
    expect(html).toContain('Productor');
    expect(html).toContain('El Rosal');
    expect(html).toContain('12345');
  });

  it('el pie de la tabla cuadra en columnas con el encabezado', () => {
    const encabezado = anchoDeFilas(html, 'th')[0];
    const pies = anchoDeFilas(html, 'td').filter((ancho) => ancho !== 0);
    // Siete desde que se quitaron Sacos y Rend.
    expect(encabezado).toBe(7);
    for (const ancho of pies) expect(ancho).toBe(encabezado);
  });

  it('no imprime bloque fiscal sin CAI', () => {
    expect(html).not.toContain('CAI:');
  });

  // Los cuatro campos viejos de `CompanySettings` ya no imprimen nada: con ellos
  // llenos y sin documento emitido, la hoja salía rotulada "no es documento fiscal" y
  // con un CAI debajo. El CAI lo trae el documento, no la configuración de la empresa.
  it('no imprime el CAI viejo de la empresa en una hoja sin documento', () => {
    const conCaiLegado = renderToStaticMarkup(
      <InvoiceA4
        data={{
          ...COMPRA,
          empresa: {
            ...EMPRESA,
            fiscal: {
              cai: 'ABCD-1234',
              rangoDesde: '000-001',
              rangoHasta: '000-500',
              fechaLimite: '31/12/2027',
            },
          },
        }}
      />,
    );

    expect(conCaiLegado).not.toContain('CAI:');
    expect(conCaiLegado).not.toContain('ABCD-1234');
    expect(conCaiLegado).toContain('no es documento fiscal');
  });
});

describe('InvoiceA4 — venta', () => {
  const VENTA: InvoiceData = {
    kind: 'venta',
    titulo: 'Comprobante de Venta',
    numeroInterno: 'V-000045',
    numeroFactura: null,
    businessDate: '2026-09-14',
    sucursalNombre: 'Bodega San Juan',
    metodoPago: null,
    empresa: EMPRESA,
    cliente: { ...CLIENTE, nombreFinca: null, claveIhcafe: null },
    lineas: [
      {
        productoNombre: 'Pergamino seco',
        pesoBruto: null,
        numeroSacos: null,
        taraPorSaco: null,
        libras: 2500,
        porcentajeOro: 54,
        quintalesOro: 10.8,
        precioPorLibra: null,
        precioPorQuintalOro: 3200,
        descripcion: null,
        total: 34560,
      },
    ],
    subtotal: 34560,
    bono: 0,
    bonoMotivo: null,
    descuento: 0,
    descuentoMotivo: null,
    total: 34560,
    totalLibras: 2500,
    totalQuintalesOro: 10.8,
  };

  const html = renderToStaticMarkup(<InvoiceA4 data={VENTA} />);

  it('distingue el precio por quintal oro del precio por libra', () => {
    expect(html).toContain('/ qq oro');
    expect(html).not.toContain('/ lb');
  });

  it('rotula al cliente como cliente y omite la forma de pago', () => {
    expect(html).toContain('Cliente');
    expect(html).not.toContain('Forma de pago');
  });

  // Lo que se quitó es de la compra: la venta es a un comprador que sí revisa el
  // detalle del lote.
  it('conserva sacos y rendimiento, que la compra ya no imprime', () => {
    expect(html).toContain('Sacos');
    expect(html).toContain('Rend.');
  });

  it('el pie de la tabla cuadra en columnas con el encabezado', () => {
    const encabezado = anchoDeFilas(html, 'th')[0];
    const pies = anchoDeFilas(html, 'td').filter((ancho) => ancho !== 0);
    // Desde que la venta se pesa, lleva las mismas columnas que la compra.
    expect(encabezado).toBe(9);
    for (const ancho of pies) expect(ancho).toBe(encabezado);
  });
});

const DOCUMENTO = {
  id: 'fd_1',
  numeroCompleto: '001-001-04-00000123',
  tipoDocumentoLabel: 'Boleta de compra',
  estado: 'emitido',
  fechaEmision: '2026-09-27',
  cai: { codigo: 'ABCD-1234-EFGH', rangoDesde: 1, rangoHasta: 500, fechaLimite: '2027-12-31' },
  desglose: {
    importeExento: 25_014,
    importeExonerado: 0,
    importeGravado15: 0,
    importeGravado18: 0,
    isv15: 0,
    isv18: 0,
  },
  anulacionMotivo: null,
};

describe('InvoiceA4 — documento fiscal', () => {
  // Sin documento la hoja no puede pasar por fiscal, y el papel tiene que decirlo.
  it('sin documento se rotula como comprobante interno', () => {
    const html = renderToStaticMarkup(<InvoiceA4 data={COMPRA} />);
    expect(html).toContain('Comprobante interno');
    expect(html).not.toContain('CAI:');
  });

  it('con documento imprime el número fiscal, el CAI y las dos fechas', () => {
    const html = renderToStaticMarkup(<InvoiceA4 data={{ ...COMPRA, businessDate: '2026-09-20', documento: DOCUMENTO }} />);

    expect(html).toContain('001-001-04-00000123');
    expect(html).toContain('ABCD-1234-EFGH');
    expect(html).not.toContain('Comprobante interno');
    // La fecha de emisión y la de la compra son distintas y salen las dos.
    expect(html).toContain('Fecha de emisión');
    expect(html).toContain('27/09/2026');
    expect(html).toContain('Fecha de la compra');
    expect(html).toContain('20/09/2026');
    // El correlativo interno sigue saliendo, ahora rotulado.
    expect(html).toContain('Control interno');
    expect(html).toContain('C-000123');
  });

  it('el rango del CAI se imprime con los ocho dígitos del formato', () => {
    const html = renderToStaticMarkup(<InvoiceA4 data={{ ...COMPRA, documento: DOCUMENTO }} />);
    expect(html).toContain('00000001');
    expect(html).toContain('00000500');
  });

  it('imprime el desglose de totales del documento', () => {
    const html = renderToStaticMarkup(<InvoiceA4 data={{ ...COMPRA, documento: DOCUMENTO }} />);
    expect(html).toContain('Importe exento');
    // Los renglones que no aplican no se imprimen: con café exonerado, no hay ISV.
    expect(html).not.toContain('ISV 15');
  });

  it('un documento anulado lo dice con su motivo', () => {
    const html = renderToStaticMarkup(
      <InvoiceA4
        data={{
          ...COMPRA,
          documento: { ...DOCUMENTO, estado: 'anulado', anulacionMotivo: 'Cliente equivocado' },
        }}
      />,
    );

    expect(html).toContain('Anulado');
    expect(html).toContain('Cliente equivocado');
  });
});

describe('InvoiceA4 — molido', () => {
  const MOLIDO: InvoiceData = {
    ...COMPRA,
    kind: 'molido',
    titulo: 'Comprobante de Servicio',
    numeroInterno: '',
    numeroFactura: null,
    metodoPago: null,
    lineas: [
      {
        productoNombre: 'Servicio de molido',
        pesoBruto: null,
        numeroSacos: null,
        taraPorSaco: null,
        libras: 50,
        porcentajeOro: null,
        quintalesOro: null,
        precioPorLibra: null,
        precioPorQuintalOro: null,
        descripcion: null,
        total: 100,
      },
    ],
    subtotal: 100,
    total: 100,
    totalLibras: 50,
    totalQuintalesOro: null,
    documento: {
      ...DOCUMENTO,
      tipoDocumentoLabel: 'Factura',
      numeroCompleto: '001-001-01-00000045',
      desglose: { ...DOCUMENTO.desglose, importeExento: 0, importeGravado15: 86.96, isv15: 13.04 },
    },
  };

  const html = renderToStaticMarkup(<InvoiceA4 data={MOLIDO} />);

  // El molido es un servicio sobre café del cliente: no hay pesaje ni rendimiento,
  // y columnas vacías solo harían dudar de si falta un dato.
  it('usa una tabla sin columnas de pesaje', () => {
    expect(html).toContain('Libras molidas');
    expect(html).not.toContain('Bruto (lb)');
    expect(html).not.toContain('QQ oro');
  });

  it('imprime el ISV, que es el único ingreso gravado', () => {
    expect(html).toContain('Importe gravado 15 %');
    expect(html).toContain('ISV 15 %');
    expect(html).toContain('13.04');
  });

  it('el pie de la tabla cuadra en columnas con el encabezado', () => {
    const encabezado = anchoDeFilas(html, 'th')[0];
    const pies = anchoDeFilas(html, 'td').filter((ancho) => ancho !== 0);
    expect(encabezado).toBe(3);
    for (const ancho of pies) expect(ancho).toBe(encabezado);
  });
});

describe('InvoiceA4 — copias', () => {
  const html = renderToStaticMarkup(<InvoiceA4 data={COMPRA} />);

  /** Hojas que se imprimen: una por copia. */
  const hojas = html.match(/class="invoice-sheet"/g) ?? [];

  it('imprime dos hojas, una por copia', () => {
    expect(hojas).toHaveLength(2);
  });

  it('rotula una copia para el cliente y la otra para el control interno', () => {
    expect(html).toContain('Original — Cliente');
    expect(html).toContain('Copia — Control interno');
  });

  it('las dos copias llevan el mismo correlativo interno', () => {
    expect(html.match(/C-000123/g)).toHaveLength(2);
  });

  it('el correlativo interno se imprime aunque no haya folio de talonario', () => {
    const sinFolio = renderToStaticMarkup(<InvoiceA4 data={{ ...COMPRA, numeroFactura: null }} />);
    expect(sinFolio).not.toContain('Factura No.');
    expect(sinFolio.match(/C-000123/g)).toHaveLength(2);
  });
});

describe('InvoiceA4 — bono y descuento', () => {
  it('no imprime el bloque de ajustes cuando no hay ninguno', () => {
    const html = renderToStaticMarkup(<InvoiceA4 data={COMPRA} />);
    expect(html).not.toContain('Subtotal café');
    expect(html).not.toContain('Descuento');
  });

  it('imprime subtotal, bono y descuento con su motivo, y el total ya ajustado', () => {
    const html = renderToStaticMarkup(
      <InvoiceA4
        data={{
          ...COMPRA,
          subtotal: 25014,
          bono: 500,
          bonoMotivo: 'Premio por calidad',
          descuento: 3000,
          descuentoMotivo: 'Pago de cortadores',
          total: 22514,
        }}
      />,
    );

    expect(html).toContain('Subtotal café');
    expect(html).toContain('Premio por calidad');
    expect(html).toContain('Pago de cortadores');
    // El total a pagar es el ajustado, no la suma de las líneas.
    expect(html).toContain('22,514.00');
  });
});
