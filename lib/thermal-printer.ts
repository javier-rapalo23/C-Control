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
  clientNombre: string;
  items: Array<{ productoNombre: string; libras: number; precioPorLibra: number; total: number }>;
  total: number;
};

export function buildTicketBuffer(data: TicketData): Buffer {
  const dash = '-'.repeat(LINE_WIDTH);
  const chunks: Buffer[] = [init(), align('center'), bold(true), text(data.company.nombre || 'C-CONTROL'), bold(false)];

  chunks.push(text('Comprobante de Compra'));
  if (data.company.rtn) chunks.push(text(`RTN: ${data.company.rtn}`));
  if (data.company.telefono) chunks.push(text(`Tel: ${data.company.telefono}`));
  if (data.company.direccion) chunks.push(text(data.company.direccion));

  chunks.push(align('left'));
  chunks.push(text(dash));
  chunks.push(text(`Fecha: ${data.businessDate}`));
  chunks.push(text(`Cliente: ${data.clientNombre}`));
  chunks.push(text(dash));

  for (const item of data.items) {
    chunks.push(text(item.productoNombre));
    const detail = `${item.libras.toFixed(2)} lb x L${item.precioPorLibra.toFixed(2)}`;
    chunks.push(text(twoColumns(detail, `L ${item.total.toFixed(2)}`)));
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
  productos: Array<{ productoNombre: string; libras: number; total: number }>;
  totalCompras: number;
  totalVentas: number;
  totalGastos: number;
  saldoInicial: number;
  saldoActual: number;
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
  chunks.push(text(twoColumns('Total Ventas:', `L ${data.totalVentas.toFixed(2)}`)));
  chunks.push(text(twoColumns('Total Gastos:', `L ${data.totalGastos.toFixed(2)}`)));
  chunks.push(text(dash));
  chunks.push(text(twoColumns('Saldo inicial:', `L ${data.saldoInicial.toFixed(2)}`)));
  chunks.push(bold(true));
  chunks.push(text(twoColumns('CIERRE EST. CAJA:', `L ${data.saldoActual.toFixed(2)}`)));
  chunks.push(bold(false));
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
