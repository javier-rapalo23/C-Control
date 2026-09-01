import { Socket } from 'net';

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
  items: Array<{
    productoNombre: string;
    libras: number;
    precioPorLibra: number;
    total: number;
    pesoBruto?: number | null;
    numeroSacos?: number | null;
    quintalesOro?: number | null;
    porcentajeOro?: number | null;
    precioPorQuintalOro?: number | null;
  }>;
  total: number;
  title?: string;
};

export function buildTicketBuffer(data: TicketData): Buffer {
  const dash = '-'.repeat(LINE_WIDTH);
  const chunks: Buffer[] = [init(), align('center'), bold(true), text(data.company.nombre || 'C-CONTROL'), bold(false)];

  chunks.push(text(data.title ?? 'Comprobante de Compra'));
  if (data.company.rtn) chunks.push(text(`RTN: ${data.company.rtn}`));
  if (data.company.telefono) chunks.push(text(`Tel: ${data.company.telefono}`));
  if (data.company.direccion) chunks.push(text(data.company.direccion));

  chunks.push(align('left'));
  chunks.push(text(dash));
  if (data.sucursalNombre) chunks.push(text(`Sucursal: ${data.sucursalNombre}`));
  chunks.push(text(`Fecha: ${data.businessDate}`));
  chunks.push(text(`Cliente: ${data.clientNombre}`));
  chunks.push(text(dash));

  for (const item of data.items) {
    chunks.push(text(item.productoNombre));

    if (item.quintalesOro != null && item.precioPorQuintalOro != null) {
      const detail = `${item.libras.toFixed(2)} lb (${item.quintalesOro.toFixed(2)} qq oro)`;
      chunks.push(text(twoColumns(detail, `L ${item.total.toFixed(2)}`)));
      const pct = item.porcentajeOro != null ? `${item.porcentajeOro.toFixed(2)}% oro` : '';
      const precio = `L${item.precioPorQuintalOro.toFixed(2)}/qq oro`;
      chunks.push(text([pct, precio].filter(Boolean).join('  ')));
      continue;
    }

    const detail = `${item.libras.toFixed(2)} lb x L${item.precioPorLibra.toFixed(2)}`;
    chunks.push(text(twoColumns(detail, `L ${item.total.toFixed(2)}`)));
    if (item.pesoBruto || item.numeroSacos || item.quintalesOro) {
      const bruto = item.pesoBruto ? `Bruto ${item.pesoBruto.toFixed(2)}lb` : '';
      const sacos = item.numeroSacos ? `${item.numeroSacos} sacos` : '';
      const oro = item.quintalesOro ? `Qq oro ${item.quintalesOro.toFixed(2)}` : '';
      chunks.push(text([bruto, sacos, oro].filter(Boolean).join('  ')));
    }
  }

  chunks.push(text(dash));
  chunks.push(bold(true));
  chunks.push(text(padLeft(`TOTAL: L ${data.total.toFixed(2)}`, LINE_WIDTH)));
  chunks.push(bold(false));
  chunks.push(align('center'));
  chunks.push(text());
  chunks.push(text('Gracias por su visita'));
  chunks.push(raw('\n\n\n'));
  chunks.push(cut());

  return Buffer.concat(chunks);
}

export type SummaryData = {
  company: { nombre: string; rtn: string; telefono: string; direccion: string };
  businessDate: string;
  sucursalNombre?: string;
  productos: Array<{ productoNombre: string; libras: number; total: number }>;
  totalCompras: number;
  /** Parte de `totalCompras` pagada con depósito o cheque, que no salió de la caja. */
  totalComprasOtrosMedios?: number;
  totalVentas: number;
  totalGastos: number;
  /** Efectivo que entró a la caja sin ser una venta. */
  totalIngresos?: number;
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
  // Solo se imprimen si existen: un día sin estos movimientos sale igual que antes,
  // y cuando los hay el ticket muestra por qué el saldo no cuadra con las compras.
  const comprasOtrosMedios = data.totalComprasOtrosMedios ?? 0;
  if (comprasOtrosMedios > 0) {
    chunks.push(text(twoColumns(' no efectivo:', `L ${comprasOtrosMedios.toFixed(2)}`)));
  }
  chunks.push(text(twoColumns('Total Ventas:', `L ${data.totalVentas.toFixed(2)}`)));
  const totalIngresos = data.totalIngresos ?? 0;
  if (totalIngresos > 0) {
    chunks.push(text(twoColumns('Ingresos efectivo:', `L ${totalIngresos.toFixed(2)}`)));
  }
  chunks.push(text(twoColumns('Total Gastos:', `L ${data.totalGastos.toFixed(2)}`)));
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
