import { prisma } from '@/lib/prisma';
import { businessDateOf, toBusinessDateString } from '@/lib/business-date';
import { paymentMethodLabel } from '@/lib/payment-methods';
import { tipoDocumentoLabel } from '@/lib/fiscal';

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
  /**
   * Constancia de registro de exonerado del SAR. Cuando viene, el documento imprime el
   * bloque del **adquiriente exonerado**: es lo que identifica de quién es la exoneración.
   */
  registroExonerado: string | null;
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
      registroExonerado: servicio.client.registroExonerado,
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

/**
 * Documento fiscal ya emitido, tal como quedó guardado. Cuando viene, **manda sobre
 * todo lo demás**: el número, las fechas, el bloque del CAI y el desglose salen de
 * acá y no de los datos vivos, que pueden haber cambiado desde la emisión.
 */
export type InvoiceDocumentoFiscal = {
  id: string;
  numeroCompleto: string;
  tipoDocumentoLabel: string;
  estado: string;
  /** Fecha en que se emitió; puede ser posterior a la de la compra. */
  fechaEmision: string;
  cai: { codigo: string; rangoDesde: number; rangoHasta: number; fechaLimite: string };
  /** Por qué se emitió la nota. Null en facturas y boletas. */
  notaMotivo?: string | null;
  /** Orden de compra exenta que amparó la operación; va en el bloque del exonerado. */
  ordenCompraExenta?: string | null;
  /**
   * El documento que esta nota modifica. Va impreso: una nota de crédito sin decir a
   * qué factura corresponde no sirve ni al cliente ni a la contadora.
   */
  documentoOrigen?: { numeroCompleto: string; tipoDocumentoLabel: string; fechaEmision: string } | null;
  desglose: {
    importeExento: number;
    importeExonerado: number;
    importeGravado15: number;
    importeGravado18: number;
    isv15: number;
    isv18: number;
  };
  anulacionMotivo: string | null;
};

export type InvoiceData = {
  /**
   * `nota` es una nota de crédito o débito: no ampara una transacción sino que modifica
   * otro documento, así que no tiene pesaje ni líneas de café, solo el concepto y el
   * monto del ajuste.
   */
  kind: 'compra' | 'venta' | 'molido' | 'nota';
  /**
   * Sobre qué transacción era el documento que la nota modifica. Solo en notas, y solo
   * para rotular: a quien se le compra café se le dice **productor**, no cliente.
   */
  notaSobre?: 'compra' | 'venta' | 'molido' | null;
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
  /**
   * Null mientras la transacción no tenga documento fiscal: la hoja sale entonces
   * rotulada como comprobante interno, que es lo que corresponde.
   */
  documento?: InvoiceDocumentoFiscal | null;
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

/** Un decimal de Prisma o un número: los dos pasan por `Number()` igual. */
type Numerico = number | { toString(): string };

/**
 * Lo que hace falta para armar la boleta de una compra. Lo cumple la fila guardada y
 * también la compra calculada antes de guardarse, que es lo que permite que la vista
 * previa salga de la misma función que el documento.
 */
export type CompraParaFactura = {
  numeroInterno: string;
  numeroFactura: string | null;
  businessDate: string;
  sucursalNombre: string;
  metodoPago: string;
  client: {
    nombre: string;
    rtn: string | null;
    telefono: string | null;
    direccion: string | null;
    claveIhcafe: string | null;
    nombreFinca: string | null;
    registroExonerado: string | null;
  };
  items: Array<{
    productoNombre: string;
    pesoBruto: Numerico | null;
    numeroSacos: number | null;
    taraPorSaco: Numerico | null;
    libras: Numerico;
    porcentajeOro: Numerico | null;
    quintalesOro: Numerico | null;
    precioPorLibra: Numerico;
    total: Numerico;
  }>;
  bono: Numerico;
  bonoMotivo: string | null;
  descuento: Numerico;
  descuentoMotivo: string | null;
  total: Numerico;
};

export async function buildInvoiceForPurchase(transactionId: string): Promise<InvoiceData | null> {
  const transaction = await prisma.purchaseTransaction.findUnique({
    where: { id: transactionId },
    include: { client: true, sucursal: true, items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!transaction) return null;

  return invoiceDataForCompra(
    {
      ...transaction,
      numeroInterno: formatNumeroInterno('compra', transaction.numeroInterno),
      businessDate: toBusinessDateString(transaction.businessDate),
      sucursalNombre: transaction.sucursal.nombre,
    },
    await getEmpresa(),
  );
}

/**
 * Boleta de una compra que todavía no se guardó, para la vista previa. Sin número
 * interno —lo asigna la base al guardar— y sin documento fiscal: eso lo agrega quien
 * llama, si corresponde.
 */
export async function buildInvoiceForPurchaseDraft(
  compra: Omit<CompraParaFactura, 'numeroInterno'>,
): Promise<InvoiceData> {
  return invoiceDataForCompra({ ...compra, numeroInterno: '' }, await getEmpresa());
}

function invoiceDataForCompra(transaction: CompraParaFactura, empresa: InvoiceEmpresa): InvoiceData {
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
    numeroInterno: transaction.numeroInterno,
    numeroFactura: transaction.numeroFactura,
    businessDate: transaction.businessDate,
    sucursalNombre: transaction.sucursalNombre,
    metodoPago: paymentMethodLabel(transaction.metodoPago),
    empresa,
    cliente: {
      nombre: transaction.client.nombre,
      rtn: transaction.client.rtn,
      telefono: transaction.client.telefono,
      direccion: transaction.client.direccion,
      claveIhcafe: transaction.client.claveIhcafe,
      nombreFinca: transaction.client.nombreFinca,
      registroExonerado: transaction.client.registroExonerado,
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
      registroExonerado: transaction.client.registroExonerado,
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

/**
 * Datos de impresión de un documento fiscal **ya emitido**, leídos de su snapshot.
 *
 * Reimprimir no vuelve a consultar la compra, el cliente ni la empresa: si cambió el
 * nombre del negocio o el del productor, el documento tiene que seguir diciendo lo
 * que decía cuando se emitió. Lo único que se lee vivo es el estado —para rotular
 * `ANULADO`— y el motivo de la anulación, que por definición se escribe después.
 */
export async function buildInvoiceFromDocument(documentId: string): Promise<InvoiceData | null> {
  const documento = await prisma.fiscalDocument.findUnique({
    where: { id: documentId },
    include: {
      cai: { select: { codigo: true } },
      // La referencia de una nota se lee viva porque es inmutable: el número y la fecha
      // del documento modificado no cambian nunca.
      documentoOrigen: { select: { numeroCompleto: true, tipoDocumento: true, emitidoEn: true } },
    },
  });
  if (!documento) return null;

  const snapshot = documento.snapshot as unknown as InvoiceData & {
    numeroFiscal?: string;
    fechaEmision?: string;
    cai?: { codigo: string; rangoDesde: number; rangoHasta: number; fechaLimite: string };
  };

  return {
    ...snapshot,
    documento: {
      id: documento.id,
      numeroCompleto: documento.numeroCompleto,
      tipoDocumentoLabel: tipoDocumentoLabel(documento.tipoDocumento),
      estado: documento.estado,
      fechaEmision: snapshot.fechaEmision ?? toBusinessDateString(documento.businessDate),
      cai: snapshot.cai ?? {
        codigo: documento.cai.codigo,
        rangoDesde: 0,
        rangoHasta: 0,
        fechaLimite: '',
      },
      notaMotivo: documento.notaMotivo,
      ordenCompraExenta: documento.ordenCompraExenta,
      documentoOrigen: documento.documentoOrigen
        ? {
            numeroCompleto: documento.documentoOrigen.numeroCompleto,
            tipoDocumentoLabel: tipoDocumentoLabel(documento.documentoOrigen.tipoDocumento),
            fechaEmision: businessDateOf(documento.documentoOrigen.emitidoEn),
          }
        : null,
      desglose: {
        importeExento: Number(documento.importeExento),
        importeExonerado: Number(documento.importeExonerado),
        importeGravado15: Number(documento.importeGravado15),
        importeGravado18: Number(documento.importeGravado18),
        isv15: Number(documento.isv15),
        isv18: Number(documento.isv18),
      },
      anulacionMotivo: documento.anulacionMotivo,
    },
  };
}

/**
 * Lo que imprime una página de factura: el documento fiscal si la transacción ya lo
 * tiene, y si no los datos vivos como comprobante interno.
 *
 * Así los enlaces de siempre —`/print/compra/:id`— siguen funcionando y pasan solos a
 * imprimir el documento en cuanto se emite.
 */
export async function buildInvoiceForOrigen(
  origen: 'compra' | 'venta' | 'molido',
  transactionId: string,
): Promise<InvoiceData | null> {
  const campo =
    origen === 'compra'
      ? { purchaseTransactionId: transactionId }
      : origen === 'venta'
        ? { saleTransactionId: transactionId }
        : { grindingServiceId: transactionId };

  const emitido = await prisma.fiscalDocument.findFirst({ where: campo, select: { id: true } });
  if (emitido) {
    return buildInvoiceFromDocument(emitido.id);
  }

  if (origen === 'compra') return buildInvoiceForPurchase(transactionId);
  if (origen === 'venta') return buildInvoiceForSale(transactionId);
  return buildInvoiceForGrinding(transactionId);
}
