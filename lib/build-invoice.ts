import { prisma } from '@/lib/prisma';
import { toBusinessDateString } from '@/lib/business-date';
import { paymentMethodLabel } from '@/lib/payment-methods';

/**
 * Datos de la factura A4, para compras y para ventas.
 *
 * Es un módulo aparte de `lib/build-ticket.ts` porque los dos documentos no
 * cargan lo mismo: el ticket térmico tiene 32 caracteres de ancho y solo cabe el
 * resultado, mientras que en A4 sí entra la trazabilidad completa del pesaje
 * —bruto, sacos, tara, rendimiento, quintales oro— que es justo lo que el
 * productor revisa cuando le liquidan. Devuelve datos y no un buffer: en A4
 * maqueta el navegador, no la impresora.
 */

export type InvoiceFiscal = {
  cai: string;
  rangoDesde: string;
  rangoHasta: string;
  fechaLimite: string;
};

export type InvoiceEmpresa = {
  nombre: string;
  rtn: string;
  telefono: string;
  direccion: string;
  email: string;
  /** Null mientras el negocio facture con talonario físico. Ver `CompanySettings`. */
  fiscal: InvoiceFiscal | null;
};

export type InvoiceCliente = {
  nombre: string;
  rtn: string | null;
  telefono: string | null;
  direccion: string | null;
  claveIhcafe: string | null;
  nombreFinca: string | null;
};

export type InvoiceLinea = {
  productoNombre: string;
  pesoBruto: number | null;
  numeroSacos: number | null;
  taraPorSaco: number | null;
  libras: number;
  porcentajeOro: number | null;
  quintalesOro: number | null;
  precioPorLibra: number | null;
  precioPorQuintalOro: number | null;
  descripcion: string | null;
  total: number;
};

/**
 * Correlativo interno ya formateado. Serie propia por tipo: `C-` para compras y
 * `V-` para ventas, para que un número no se pueda leer como el del otro
 * documento. El relleno a seis dígitos es cosmético; el número es el entero.
 */
export function formatNumeroInterno(kind: 'compra' | 'venta', numeroInterno: number): string {
  return `${kind === 'compra' ? 'C' : 'V'}-${String(numeroInterno).padStart(6, '0')}`;
}

/**
 * Datos del comprobante de un servicio de molido. No tiene número interno propio
 * —el molido no es una transacción de compra ni de venta— y su única línea es el
 * servicio, con las libras molidas como referencia.
 */
export async function buildInvoiceForGrinding(grindingServiceId: string): Promise<InvoiceData | null> {
  const servicio = await prisma.grindingService.findUnique({
    where: { id: grindingServiceId },
    include: { client: true, sucursal: true },
  });
  if (!servicio) return null;

  const monto = Number(servicio.monto);
  const lineas: InvoiceLinea[] = [
    {
      productoNombre: 'Servicio de molido',
      pesoBruto: null,
      numeroSacos: null,
      taraPorSaco: null,
      libras: Number(servicio.libras),
      porcentajeOro: null,
      quintalesOro: null,
      precioPorLibra: null,
      precioPorQuintalOro: null,
      descripcion: servicio.notas,
      total: monto,
    },
  ];

  return {
    kind: 'molido',
    titulo: 'Comprobante de Servicio',
    numeroInterno: '',
    numeroFactura: null,
    businessDate: toBusinessDateString(servicio.businessDate),
    sucursalNombre: servicio.sucursal.nombre,
    metodoPago: null,
    empresa: await getEmpresa(),
    cliente: {
      nombre: servicio.client.nombre,
      rtn: servicio.client.rtn,
      telefono: servicio.client.telefono,
      direccion: servicio.client.direccion,
      claveIhcafe: servicio.client.claveIhcafe,
      nombreFinca: servicio.client.nombreFinca,
    },
    lineas,
    subtotal: monto,
    bono: 0,
    bonoMotivo: null,
    descuento: 0,
    descuentoMotivo: null,
    total: monto,
    ...sumar(lineas),
  };
}

export type InvoiceData = {
  kind: 'compra' | 'venta' | 'molido';
  titulo: string;
  /** Correlativo interno del sistema (`C-000123`). Siempre presente. */
  numeroInterno: string;
  /** Número del talonario físico. Null cuando no se capturó. */
  numeroFactura: string | null;
  businessDate: string;
  sucursalNombre: string;
  metodoPago: string | null;
  empresa: InvoiceEmpresa;
  cliente: InvoiceCliente;
  lineas: InvoiceLinea[];
  /** Suma de las líneas, sin ajustes. En ventas coincide con `total`. */
  subtotal: number;
  /** Ajustes al pie de una compra; 0 cuando no hubo. Ver §6.4. */
  bono: number;
  bonoMotivo: string | null;
  descuento: number;
  descuentoMotivo: string | null;
  /** Lo que se paga o se cobra: `subtotal + bono − descuento`. */
  total: number;
  /** Totales de pie. Se omiten los que no aplican a la transacción. */
  totalLibras: number;
  totalQuintalesOro: number | null;
};

async function getEmpresa(): Promise<InvoiceEmpresa> {
  const company = await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  // El bloque fiscal se arma solo si hay CAI: así activar la facturación
  // autorizada es llenar los campos en Mantenimiento, sin tocar código.
  const fiscal: InvoiceFiscal | null = company.cai
    ? {
        cai: company.cai,
        rangoDesde: company.facturaRangoDesde,
        rangoHasta: company.facturaRangoHasta,
        fechaLimite: company.facturaFechaLimite,
      }
    : null;

  return {
    nombre: company.nombre,
    rtn: company.rtn,
    telefono: company.telefono,
    direccion: company.direccion,
    email: company.email,
    fiscal,
  };
}

function sumar(lineas: InvoiceLinea[]) {
  const totalLibras = lineas.reduce((acumulado, linea) => acumulado + linea.libras, 0);
  // Null y no 0 cuando ninguna línea trae rendimiento: un cero impreso se lee como
  // "no rindió", y lo cierto es que todavía no se sabe.
  const conOro = lineas.filter((linea) => linea.quintalesOro !== null);
  const totalQuintalesOro = conOro.length > 0
    ? conOro.reduce((acumulado, linea) => acumulado + (linea.quintalesOro ?? 0), 0)
    : null;
  return { totalLibras, totalQuintalesOro };
}

export async function buildInvoiceForPurchase(transactionId: string): Promise<InvoiceData | null> {
  const transaction = await prisma.purchaseTransaction.findUnique({
    where: { id: transactionId },
    include: { client: true, sucursal: true, items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!transaction) return null;

  const lineas: InvoiceLinea[] = transaction.items.map((item) => ({
    productoNombre: item.productoNombre,
    pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
    numeroSacos: item.numeroSacos,
    taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
    libras: Number(item.libras),
    porcentajeOro: item.porcentajeOro !== null ? Number(item.porcentajeOro) : null,
    quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
    precioPorLibra: Number(item.precioPorLibra),
    precioPorQuintalOro: null,
    descripcion: null,
    total: Number(item.total),
  }));

  return {
    kind: 'compra',
    titulo: 'Comprobante de Compra',
    numeroInterno: formatNumeroInterno('compra', transaction.numeroInterno),
    numeroFactura: transaction.numeroFactura,
    businessDate: toBusinessDateString(transaction.businessDate),
    sucursalNombre: transaction.sucursal.nombre,
    metodoPago: paymentMethodLabel(transaction.metodoPago),
    empresa: await getEmpresa(),
    cliente: {
      nombre: transaction.client.nombre,
      rtn: transaction.client.rtn,
      telefono: transaction.client.telefono,
      direccion: transaction.client.direccion,
      claveIhcafe: transaction.client.claveIhcafe,
      nombreFinca: transaction.client.nombreFinca,
    },
    lineas,
    subtotal: lineas.reduce((suma, linea) => suma + linea.total, 0),
    bono: Number(transaction.bono),
    bonoMotivo: transaction.bonoMotivo,
    descuento: Number(transaction.descuento),
    descuentoMotivo: transaction.descuentoMotivo,
    total: Number(transaction.total),
    ...sumar(lineas),
  };
}

export async function buildInvoiceForSale(transactionId: string): Promise<InvoiceData | null> {
  const transaction = await prisma.saleTransaction.findUnique({
    where: { id: transactionId },
    include: { client: true, sucursal: true, items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!transaction) return null;

  const lineas: InvoiceLinea[] = transaction.items.map((item) => ({
    // Una venta puede no tener producto: la línea libre solo lleva descripción y monto.
    productoNombre: item.productoNombre ?? 'Venta',
    pesoBruto: item.pesoBruto !== null ? Number(item.pesoBruto) : null,
    numeroSacos: item.numeroSacos,
    taraPorSaco: item.taraPorSaco !== null ? Number(item.taraPorSaco) : null,
    libras: item.libras !== null ? Number(item.libras) : 0,
    porcentajeOro: item.porcentajeOro !== null ? Number(item.porcentajeOro) : null,
    quintalesOro: item.quintalesOro !== null ? Number(item.quintalesOro) : null,
    precioPorLibra: item.precioPorLibra !== null ? Number(item.precioPorLibra) : null,
    precioPorQuintalOro: item.precioPorQuintalOro !== null ? Number(item.precioPorQuintalOro) : null,
    descripcion: item.descripcion,
    total: Number(item.monto),
  }));

  return {
    kind: 'venta',
    titulo: 'Comprobante de Venta',
    numeroInterno: formatNumeroInterno('venta', transaction.numeroInterno),
    // Las ventas no llevan número de talonario: §19.3 lo decidió solo para compras.
    numeroFactura: null,
    businessDate: toBusinessDateString(transaction.businessDate),
    sucursalNombre: transaction.sucursal.nombre,
    metodoPago: null,
    empresa: await getEmpresa(),
    cliente: {
      nombre: transaction.client.nombre,
      rtn: transaction.client.rtn,
      telefono: transaction.client.telefono,
      direccion: transaction.client.direccion,
      claveIhcafe: transaction.client.claveIhcafe,
      nombreFinca: transaction.client.nombreFinca,
    },
    lineas,
    // Las ventas no llevan ajustes al pie: el bono y el descuento son de la compra.
    subtotal: Number(transaction.total),
    bono: 0,
    bonoMotivo: null,
    descuento: 0,
    descuentoMotivo: null,
    total: Number(transaction.total),
    ...sumar(lineas),
  };
}
