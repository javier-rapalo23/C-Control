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

export type InvoiceData = {
  kind: 'compra' | 'venta';
  titulo: string;
  numeroFactura: string | null;
  businessDate: string;
  sucursalNombre: string;
  metodoPago: string | null;
  empresa: InvoiceEmpresa;
  cliente: InvoiceCliente;
  lineas: InvoiceLinea[];
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
    total: Number(transaction.total),
    ...sumar(lineas),
  };
}
