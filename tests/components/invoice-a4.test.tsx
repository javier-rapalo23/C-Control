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

  it('rotula al cliente como productor y muestra finca y clave IHCAFE', () => {
    expect(html).toContain('Productor');
    expect(html).toContain('El Rosal');
    expect(html).toContain('12345');
  });

  it('el pie de la tabla cuadra en columnas con el encabezado', () => {
    const encabezado = anchoDeFilas(html, 'th')[0];
    const pies = anchoDeFilas(html, 'td').filter((ancho) => ancho !== 0);
    expect(encabezado).toBe(9);
    for (const ancho of pies) expect(ancho).toBe(encabezado);
  });

  it('no imprime bloque fiscal sin CAI', () => {
    expect(html).not.toContain('CAI:');
  });

  it('imprime el bloque fiscal cuando la empresa ya tiene CAI', () => {
    const conCai = renderToStaticMarkup(
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
    expect(conCai).toContain('CAI:');
    expect(conCai).toContain('ABCD-1234');
    expect(conCai).toContain('31/12/2027');
  });
});

describe('InvoiceA4 — venta', () => {
  const VENTA: InvoiceData = {
    kind: 'venta',
    titulo: 'Comprobante de Venta',
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

  it('el pie de la tabla cuadra en columnas con el encabezado', () => {
    const encabezado = anchoDeFilas(html, 'th')[0];
    const pies = anchoDeFilas(html, 'td').filter((ancho) => ancho !== 0);
    expect(encabezado).toBe(6);
    for (const ancho of pies) expect(ancho).toBe(encabezado);
  });
});
