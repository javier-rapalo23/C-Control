import { Socket } from 'net';
import { RENGLONES_DESGLOSE } from '@/lib/fiscal';

const ESC = 0x1b;
const GS = 0x1d;
const LINE_WIDTH = 32;

function text(value = '') {
  return Buffer.from(`${value}\n`, 'latin1');
}

function raw(value: string) {
  return Buffer.from(value, 'latin1');
}

function align(mode: 'left' | 'center') {
  return Buffer.from([ESC, 0x61, mode === 'center' ? 0x01 : 0x00]);
}

function bold(on: boolean) {
  return Buffer.from([ESC, 0x45, on ? 1 : 0]);
}

function cut() {
  return Buffer.from([GS, 0x56, 0x00]);
}

function init() {
  return Buffer.from([ESC, 0x40]);
}

function padRight(value: string, width: number) {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

function padLeft(value: string, width: number) {
  return value.length >= width ? value.slice(0, width) : ' '.repeat(width - value.length) + value;
}

function twoColumns(left: string, right: string) {
  if (left.length + right.length + 1 <= LINE_WIDTH) {
    return `${padRight(left, LINE_WIDTH - right.length)}${right}`;
  }
  return `${left}\n${padLeft(right, LINE_WIDTH)}`;
}

export type TicketData = {
  company: { nombre: string; rtn: string; telefono: string; direccion: string };
  businessDate: string;
  sucursalNombre?: string;
  clientNombre: string;
  /** RTN del cliente. Va impreso porque lo pide el formato del SAR. */
  clientRtn?: string | null;
  /** Constancia de registro de exonerado del cliente, si la tiene. */
  registroExonerado?: string | null;
  items: Array<{
    productoNombre: string;
    libras: number;
    precioPorLibra: number;
    total: number;
    pesoBruto?: number | null;
    numeroSacos?: number | null;
    /** Tara total en libras (tara por saco × sacos), ya calculada. */
    taraTotal?: number | null;
    quintalesOro?: number | null;
    porcentajeOro?: number | null;
    precioPorQuintalOro?: number | null;
  }>;
  /** Suma de las líneas. Solo se imprime si hay bono o descuento que explicar. */
  subtotal?: number;
  bono?: number;
  bonoMotivo?: string | null;
  descuento?: number;
  descuentoMotivo?: string | null;
  total: number;
  title?: string;
  /** Correlativo interno ya formateado (`C-000123`). Ver `lib/build-invoice.ts`. */
  numeroInterno?: string;
  /**
   * Compra, venta o molido. La compra **no imprime el conteo de sacos**, igual que su
   * factura A4: la tara ya dice lo que se descuenta. En la venta sí sale.
   */
  kind?: 'compra' | 'venta' | 'molido' | 'nota';
  /**
   * Documento fiscal emitido. El ticket de 80 mm y la hoja A4 son **el mismo
   * documento** en dos formatos, así que cuando existe, el ticket imprime lo mismo
   * que la hoja: número fiscal, CAI, las dos fechas y el desglose.
   */
  documento?: {
    numeroCompleto: string;
    tipoDocumentoLabel: string;
    estado: string;
    fechaEmision: string;
    cai: { codigo: string; rangoDesde: number; rangoHasta: number; fechaLimite: string };
    desglose: {
      importeExento: number;
      importeExonerado: number;
      importeGravado15: number;
      importeGravado18: number;
      isv15: number;
      isv18: number;
    };
    anulacionMotivo: string | null;
    /** Orden de compra exenta de la operación, para el bloque del exonerado. */
    ordenCompraExenta?: string | null;
    /** Solo en notas: por qué se emitió y qué documento corrige. */
    notaMotivo?: string | null;
    documentoOrigen?: { numeroCompleto: string; tipoDocumentoLabel: string; fechaEmision: string } | null;
  } | null;
};

/**
 * Las dos copias que salen de la térmica, igual que en la factura A4: la que se
 * entrega y la que se archiva. Van en el mismo trabajo, cada una con su corte,
 * porque dos trabajos podían quedar separados en la cola y salir uno sin el otro.
 */
const TICKET_COPIAS = ['Cliente', 'Control interno'] as const;

/** Los ocho dígitos del correlativo, como se imprime en el formato del SAR. */
const pad8 = (valor: number) => String(valor).padStart(8, '0');

/** Cómo se rotula la fecha de la operación, igual que en la hoja A4. */
function fechaOperacionLabel(kind: TicketData['kind']) {
  if (kind === 'compra') return 'Fecha compra';
  if (kind === 'molido') return 'Fecha servicio';
  // Una nota se emite hoy y no ampara ninguna operación anterior.
  if (kind === 'nota') return 'Fecha';
  return 'Fecha venta';
}

/**
 * Parte un texto en líneas de 32 columnas sin cortar palabras.
 *
 * Hace falta para el motivo de una nota: es texto libre que escribe una persona y en la
 * térmica no hay ajuste automático —lo que pasa de 32 caracteres se pierde—.
 */
function wrap(value: string, width = LINE_WIDTH): string[] {
  const lineas: string[] = [];
  let actual = '';

  for (const palabra of value.split(/\s+/).filter(Boolean)) {
    if (actual === '') {
      actual = palabra;
    } else if (`${actual} ${palabra}`.length <= width) {
      actual = `${actual} ${palabra}`;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
    // Una palabra más larga que el ancho no tiene dónde partirse: se corta a lo ancho.
    while (actual.length > width) {
      lineas.push(actual.slice(0, width));
      actual = actual.slice(width);
    }
  }

  if (actual !== '') lineas.push(actual);
  return lineas.length > 0 ? lineas : [''];
}

function ticketCopyChunks(data: TicketData, copia: (typeof TICKET_COPIAS)[number]): Buffer[] {
  const dash = '-'.repeat(LINE_WIDTH);
  const chunks: Buffer[] = [init(), align('center'), bold(true), text(data.company.nombre || 'C-CONTROL'), bold(false)];

  const documento = data.documento ?? null;

  // Con documento emitido manda el tipo de documento fiscal; sin él, el título de
  // siempre.
  chunks.push(text(documento ? documento.tipoDocumentoLabel : (data.title ?? 'Comprobante de Compra')));
  // El rótulo va arriba: con el ticket en la mano es lo que dice cuál de las dos
  // copias es, y en 32 columnas no se puede poner al margen.
  chunks.push(bold(true));
  chunks.push(text(`*** ${copia.toUpperCase()} ***`));
  if (documento) chunks.push(text(`No. ${documento.numeroCompleto}`));
  else if (data.numeroInterno) chunks.push(text(`No. ${data.numeroInterno}`));
  chunks.push(bold(false));
  // El correlativo interno sigue saliendo cuando hay número fiscal: es el que casa
  // las dos copias y el que se busca dentro del sistema.
  if (documento && data.numeroInterno) chunks.push(text(`Control interno ${data.numeroInterno}`));
  if (data.company.rtn) chunks.push(text(`RTN: ${data.company.rtn}`));
  if (data.company.telefono) chunks.push(text(`Tel: ${data.company.telefono}`));
  if (data.company.direccion) chunks.push(text(data.company.direccion));

  chunks.push(align('left'));
  chunks.push(text(dash));

  // Mismo criterio que la hoja A4: sin documento, el papel dice que no es fiscal.
  if (!documento) {
    chunks.push(text('COMPROBANTE INTERNO'));
    chunks.push(text('No es documento fiscal'));
    chunks.push(text(dash));
  } else {
    chunks.push(text(`CAI: ${documento.cai.codigo}`));
    if (documento.cai.rangoDesde && documento.cai.rangoHasta) {
      chunks.push(text(`Rango: ${pad8(documento.cai.rangoDesde)} a`));
      chunks.push(text(`       ${pad8(documento.cai.rangoHasta)}`));
    }
    if (documento.cai.fechaLimite) chunks.push(text(`Limite emision: ${documento.cai.fechaLimite}`));
    chunks.push(text(dash));
    chunks.push(text(`Emitida: ${documento.fechaEmision}`));

    // Una nota tiene que decir a qué documento corresponde: es lo que empareja los dos
    // papeles cuando se archivan.
    if (documento.documentoOrigen) {
      chunks.push(text(`Modifica ${documento.documentoOrigen.tipoDocumentoLabel}`));
      chunks.push(text(`No. ${documento.documentoOrigen.numeroCompleto}`));
      chunks.push(text(`del ${documento.documentoOrigen.fechaEmision}`));
    }
  }

  if (data.sucursalNombre) chunks.push(text(`Sucursal: ${data.sucursalNombre}`));
  chunks.push(text(`${documento ? fechaOperacionLabel(data.kind) : 'Fecha'}: ${data.businessDate}`));
  // El nombre se envuelve: una razón social entera no cabe en 32 columnas, y en un
  // documento fiscal un nombre cortado a la mitad es un defecto, no un detalle.
  for (const linea of wrap(`Cliente: ${data.clientNombre}`)) chunks.push(text(linea));
  // "RTN cliente" y no "RTN": el RTN de la empresa ya salió en el encabezado.
  if (data.clientRtn) chunks.push(text(`RTN cliente: ${data.clientRtn}`));

  // Bloque del adquiriente exonerado, igual que en la hoja A4: sin la constancia y la
  // orden, la exoneración no se puede sustentar.
  if (data.registroExonerado || documento?.ordenCompraExenta) {
    chunks.push(text(dash));
    chunks.push(text('ADQUIRIENTE EXONERADO'));
    if (data.registroExonerado) {
      chunks.push(text('Constancia registro:'));
      for (const linea of wrap(data.registroExonerado)) chunks.push(text(` ${linea}`.slice(0, LINE_WIDTH)));
    }
    if (documento?.ordenCompraExenta) {
      chunks.push(text('Orden compra exenta:'));
      for (const linea of wrap(documento.ordenCompraExenta)) chunks.push(text(` ${linea}`.slice(0, LINE_WIDTH)));
    }
  }

  if (documento?.estado === 'anulado') {
    chunks.push(text(dash));
    chunks.push(bold(true));
    chunks.push(align('center'));
    chunks.push(text('*** ANULADO ***'));
    chunks.push(align('left'));
    chunks.push(bold(false));
    if (documento.anulacionMotivo) chunks.push(text(documento.anulacionMotivo));
  }

  chunks.push(text(dash));

  for (const item of data.items) {
    // Una nota no tiene libras ni precio por libra: su línea es el concepto del ajuste
    // —texto libre, así que se envuelve— y el monto.
    if (data.kind === 'nota') {
      for (const linea of wrap(item.productoNombre)) chunks.push(text(linea));
      chunks.push(text(padLeft(`L ${item.total.toFixed(2)}`, LINE_WIDTH)));
      continue;
    }

    chunks.push(text(item.productoNombre));

    if (item.quintalesOro != null && item.precioPorQuintalOro != null) {
      const detail = `${item.libras.toFixed(2)} lb (${item.quintalesOro.toFixed(2)} qq oro)`;
      chunks.push(text(twoColumns(detail, `L ${item.total.toFixed(2)}`)));
      const pct = item.porcentajeOro != null ? `${item.porcentajeOro.toFixed(2)}% oro` : '';
      const precio = `L${item.precioPorQuintalOro.toFixed(2)}/qq oro`;
      chunks.push(text([pct, precio].filter(Boolean).join('  ')));
      continue;
    }

    // El molido se cobra por el servicio, no a un precio por libra: imprimir
    // "x L0.00" hacía dudar de si faltaba un dato.
    const detail =
      item.precioPorLibra > 0
        ? `${item.libras.toFixed(2)} lb x L${item.precioPorLibra.toFixed(2)}`
        : `${item.libras.toFixed(2)} lb`;
    chunks.push(text(twoColumns(detail, `L ${item.total.toFixed(2)}`)));
    // El pesaje va debajo del neto para que el productor pueda rehacer la cuenta:
    // bruto menos tara es lo que se le paga.
    if (item.pesoBruto || item.taraTotal || item.numeroSacos || item.quintalesOro) {
      const conSacos = data.kind !== 'compra';
      const bruto = item.pesoBruto ? `Bruto ${item.pesoBruto.toFixed(2)}lb` : '';
      const tara = item.taraTotal
        ? `Tara ${item.taraTotal.toFixed(2)}lb${conSacos && item.numeroSacos ? ` (${item.numeroSacos} sacos)` : ''}`
        : conSacos && item.numeroSacos
          ? `${item.numeroSacos} sacos`
          : '';
      const oro = item.quintalesOro ? `Qq oro ${item.quintalesOro.toFixed(2)}` : '';
      // Una sola línea de 32 caracteres no aguanta las tres cosas juntas. Bruto y tara
      // van juntos solo si caben: con el conteo de sacos se pasan, y partir "Tara" de su
      // monto se lee peor que ponerlos en dos líneas.
      const pesaje = [bruto, tara].filter(Boolean).join('  ');
      const lineasPesaje = pesaje.length <= LINE_WIDTH ? [pesaje] : [bruto, tara].filter(Boolean);
      for (const linea of [...lineasPesaje, oro].filter(Boolean)) {
        chunks.push(text(linea));
      }
    }
  }

  chunks.push(text(dash));

  // Sin ajustes el pie queda igual que siempre: una sola línea de total. Con ellos
  // se imprime de dónde sale el total, porque es lo primero que se reclama.
  const bono = data.bono ?? 0;
  const descuento = data.descuento ?? 0;
  if (bono > 0 || descuento > 0) {
    const subtotal = data.subtotal ?? data.items.reduce((suma, item) => suma + item.total, 0);
    chunks.push(text(twoColumns('Subtotal:', `L ${subtotal.toFixed(2)}`)));
    if (bono > 0) {
      chunks.push(text(twoColumns('Bono:', `+L ${bono.toFixed(2)}`)));
      if (data.bonoMotivo) chunks.push(text(` ${data.bonoMotivo}`));
    }
    if (descuento > 0) {
      chunks.push(text(twoColumns('Descuento:', `-L ${descuento.toFixed(2)}`)));
      if (data.descuentoMotivo) chunks.push(text(` ${data.descuentoMotivo}`));
    }
  }

  // Desglose fiscal: los mismos siete renglones que la hoja A4, **todos y siempre**,
  // aunque vayan en cero. La lista sale de `lib/fiscal.ts` para que los dos formatos no
  // puedan discrepar.
  if (documento) {
    for (const renglon of RENGLONES_DESGLOSE) {
      chunks.push(text(twoColumns(renglon.labelTicket, `L ${documento.desglose[renglon.key].toFixed(2)}`)));
    }
  }

  chunks.push(bold(true));
  chunks.push(text(padLeft(`TOTAL: L ${data.total.toFixed(2)}`, LINE_WIDTH)));
  chunks.push(bold(false));
  chunks.push(align('center'));
  chunks.push(text());
  // Una nota de crédito no es una visita al mostrador: es la corrección de un papel.
  if (data.kind !== 'nota') chunks.push(text('Gracias por su visita'));
  chunks.push(raw('\n\n\n'));
  chunks.push(cut());

  return chunks;
}

export function buildTicketBuffer(data: TicketData): Buffer {
  return Buffer.concat(TICKET_COPIAS.flatMap((copia) => ticketCopyChunks(data, copia)));
}

export type SummaryData = {
  company: { nombre: string; rtn: string; telefono: string; direccion: string };
  businessDate: string;
  sucursalNombre?: string;
  productos: Array<{ productoNombre: string; libras: number; total: number }>;
  totalCompras: number;
  /** Desglose de `totalCompras` por forma de pago. Cada renglón sale solo si hay monto. */
  totalComprasEfectivo?: number;
  totalComprasDeposito?: number;
  totalComprasCheque?: number;
  totalComprasPendientes?: number;
  totalVentas: number;
  totalGastos: number;
  /** Efectivo que entró a la caja sin ser una venta. */
  totalIngresos?: number;
  /** Cobros del servicio de molido. */
  totalMolido?: number;
  /** Compras pendientes de otros días pagadas hoy en efectivo. */
  totalPagosPendientes?: number;
  /** Efectivo que salió de la caja sin ser compra ni gasto. */
  totalSalidas?: number;
  /** Efectivo recibido de otras bodegas y enviado a ellas. */
  totalTrasladosRecibidos?: number;
  totalTrasladosEnviados?: number;
  saldoInicial: number;
  saldoActual: number;
  /**
   * Arqueo de la fecha, si hay sesión de caja. Cuando está cerrada, el ticket
   * imprime el conteo real y su diferencia en vez del cierre estimado.
   */
  arqueo?: {
    estado: 'abierta' | 'cerrada';
    montoApertura: number;
    abiertaPor: string;
    saldoEsperado: number | null;
    montoContado: number | null;
    diferencia: number | null;
    cerradaPor: string | null;
  } | null;
};

export function buildSummaryBuffer(data: SummaryData): Buffer {
  const dash = '-'.repeat(LINE_WIDTH);
  const chunks: Buffer[] = [init(), align('center'), bold(true), text(data.company.nombre || 'C-CONTROL'), bold(false)];

  chunks.push(text('Resumen del Dia'));
  if (data.company.rtn) chunks.push(text(`RTN: ${data.company.rtn}`));
  if (data.company.telefono) chunks.push(text(`Tel: ${data.company.telefono}`));
  if (data.company.direccion) chunks.push(text(data.company.direccion));

  chunks.push(align('left'));
  chunks.push(text(dash));
  if (data.sucursalNombre) chunks.push(text(`Sucursal: ${data.sucursalNombre}`));
  chunks.push(text(`Fecha: ${data.businessDate}`));
  chunks.push(text(dash));

  chunks.push(bold(true));
  chunks.push(text('COMPRAS POR PRODUCTO'));
  chunks.push(bold(false));
  if (data.productos.length === 0) {
    chunks.push(text('Sin compras registradas'));
  }
  for (const item of data.productos) {
    chunks.push(text(item.productoNombre));
    chunks.push(text(twoColumns(`${item.libras.toFixed(2)} lb`, `L ${item.total.toFixed(2)}`)));
  }

  chunks.push(text(dash));
  chunks.push(text(twoColumns('Total Compras:', `L ${data.totalCompras.toFixed(2)}`)));
  // Desglose por forma de pago: cada renglón solo si hay monto, para que un día
  // que se pagó todo en efectivo salga igual de corto que antes. Así se ve por qué
  // el saldo no cuadra con el total de compras.
  const desgloseCompras: Array<[string, number]> = [
    [' efectivo:', data.totalComprasEfectivo ?? 0],
    [' deposito:', data.totalComprasDeposito ?? 0],
    [' cheque:', data.totalComprasCheque ?? 0],
    [' pendientes:', data.totalComprasPendientes ?? 0],
  ];
  for (const [etiqueta, monto] of desgloseCompras) {
    if (monto > 0) chunks.push(text(twoColumns(etiqueta, `L ${monto.toFixed(2)}`)));
  }
  // Compras pendientes de días anteriores liquidadas hoy en efectivo: no están en
  // el total de compras de hoy, pero sí salieron de esta caja.
  const pagosPendientes = data.totalPagosPendientes ?? 0;
  if (pagosPendientes > 0) {
    chunks.push(text(twoColumns('Pago de pendientes:', `L ${pagosPendientes.toFixed(2)}`)));
  }
  chunks.push(text(twoColumns('Total Ventas:', `L ${data.totalVentas.toFixed(2)}`)));
  const totalIngresos = data.totalIngresos ?? 0;
  if (totalIngresos > 0) {
    chunks.push(text(twoColumns('Ingresos efectivo:', `L ${totalIngresos.toFixed(2)}`)));
  }
  const totalMolido = data.totalMolido ?? 0;
  if (totalMolido > 0) {
    chunks.push(text(twoColumns('Molido:', `L ${totalMolido.toFixed(2)}`)));
  }
  chunks.push(text(twoColumns('Total Gastos:', `L ${data.totalGastos.toFixed(2)}`)));
  const totalSalidas = data.totalSalidas ?? 0;
  if (totalSalidas > 0) {
    chunks.push(text(twoColumns('Salidas efectivo:', `L ${totalSalidas.toFixed(2)}`)));
  }
  const trasladosRecibidos = data.totalTrasladosRecibidos ?? 0;
  if (trasladosRecibidos > 0) {
    chunks.push(text(twoColumns('Traslados recib.:', `L ${trasladosRecibidos.toFixed(2)}`)));
  }
  const trasladosEnviados = data.totalTrasladosEnviados ?? 0;
  if (trasladosEnviados > 0) {
    chunks.push(text(twoColumns('Traslados env.:', `L ${trasladosEnviados.toFixed(2)}`)));
  }
  chunks.push(text(dash));
  chunks.push(text(twoColumns('Saldo inicial:', `L ${data.saldoInicial.toFixed(2)}`)));

  const arqueo = data.arqueo;

  if (arqueo?.estado === 'cerrada') {
    chunks.push(text(dash));
    chunks.push(bold(true));
    chunks.push(text('ARQUEO DE CAJA'));
    chunks.push(bold(false));
    chunks.push(text(twoColumns('Apertura:', `L ${arqueo.montoApertura.toFixed(2)}`)));
    chunks.push(text(twoColumns('Saldo esperado:', `L ${(arqueo.saldoEsperado ?? 0).toFixed(2)}`)));
    chunks.push(text(twoColumns('Efectivo contado:', `L ${(arqueo.montoContado ?? 0).toFixed(2)}`)));

    const diferencia = arqueo.diferencia ?? 0;
    // El signo por sí solo se malinterpreta en papel, así que se nombra.
    const etiqueta =
      Math.abs(diferencia) < 0.005 ? 'Diferencia (cuadra):' : diferencia < 0 ? 'Diferencia (FALTA):' : 'Diferencia (SOBRA):';
    chunks.push(bold(true));
    chunks.push(text(twoColumns(etiqueta, `L ${diferencia.toFixed(2)}`)));
    chunks.push(bold(false));

    chunks.push(text(`Abrio: ${arqueo.abiertaPor}`));
    if (arqueo.cerradaPor) chunks.push(text(`Cerro: ${arqueo.cerradaPor}`));

    chunks.push(text(dash));
    chunks.push(bold(true));
    chunks.push(text(twoColumns('CIERRE DE CAJA:', `L ${data.saldoActual.toFixed(2)}`)));
    chunks.push(bold(false));
  } else {
    if (arqueo?.estado === 'abierta') {
      chunks.push(text(twoColumns('Caja abierta con:', `L ${arqueo.montoApertura.toFixed(2)}`)));
      chunks.push(text(`Abrio: ${arqueo.abiertaPor}`));
    }
    // Sin cierre no hay conteo real: se mantiene explícito que la cifra es estimada.
    chunks.push(bold(true));
    chunks.push(text(twoColumns('CIERRE EST. CAJA:', `L ${data.saldoActual.toFixed(2)}`)));
    chunks.push(bold(false));
  }

  chunks.push(align('center'));
  chunks.push(raw('\n\n\n'));
  chunks.push(cut());

  return Buffer.concat(chunks);
}

export function sendToPrinter(ip: string, port: number, buffer: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error(`Tiempo de espera agotado conectando a la impresora ${ip}:${port}`)));
    socket.once('error', (err) => finish(new Error(`No se pudo conectar a la impresora (${ip}:${port}): ${err.message}`)));

    socket.connect(port, ip, () => {
      socket.write(buffer, (err) => {
        if (err) finish(new Error(`Error enviando datos a la impresora: ${err.message}`));
        else finish();
      });
    });
  });
}
