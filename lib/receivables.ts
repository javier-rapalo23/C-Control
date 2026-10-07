import { Prisma, PrismaClient } from '@prisma/client';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { formatNumeroInterno } from '@/lib/build-invoice';
import { CREDIT_SALE_METHOD, paymentMethodLabel } from '@/lib/payment-methods';
import type {
  AccountStatementDTO,
  AccountStatementMovementDTO,
  ClientPaymentDTO,
  ReceivableClientDTO,
  ReceivableSaleDTO,
} from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/** Error de negocio de cuentas por cobrar, con el estado HTTP que le corresponde. */
export class ReceivableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

const round = (value: number) => Number(value.toFixed(2));

/** Días entre dos fechas `YYYY-MM-DD`, sin que la zona horaria mueva el resultado. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const creditSaleSelect = {
  id: true,
  businessDate: true,
  sucursalId: true,
  clientId: true,
  numeroInterno: true,
  total: true,
  createdAt: true,
  fiscalDocument: { select: { numeroCompleto: true, estado: true } },
  aplicaciones: { select: { monto: true } },
} as const;

type CreditSaleRow = Prisma.SaleTransactionGetPayload<{ select: typeof creditSaleSelect }>;

function abonado(sale: Pick<CreditSaleRow, 'aplicaciones'>) {
  return sale.aplicaciones.reduce((suma, aplicacion) => suma.add(aplicacion.monto), ZERO);
}

/** Lo que falta por cobrar de una venta a crédito. */
export function saldoVenta(sale: Pick<CreditSaleRow, 'total' | 'aplicaciones'>) {
  return sale.total.sub(abonado(sale));
}

function mapReceivableSale(sale: CreditSaleRow, hoy: string): ReceivableSaleDTO {
  const pagado = abonado(sale);
  const fecha = toBusinessDateString(sale.businessDate);
  return {
    id: sale.id,
    businessDate: fecha,
    sucursalId: sale.sucursalId,
    numeroInterno: formatNumeroInterno('venta', sale.numeroInterno),
    numeroFiscal: sale.fiscalDocument?.estado === 'emitido' ? sale.fiscalDocument.numeroCompleto : null,
    total: Number(sale.total),
    abonado: Number(pagado),
    saldo: Number(sale.total.sub(pagado)),
    dias: Math.max(0, daysBetween(fecha, hoy)),
  };
}

/** Ventas a crédito de un cliente con saldo, de la más antigua a la más reciente. */
export async function findPendingCreditSales(db: DbClient, clientId: string) {
  const ventas = await db.saleTransaction.findMany({
    where: { clientId, metodoPago: CREDIT_SALE_METHOD },
    orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    select: creditSaleSelect,
  });
  return ventas.filter((venta) => venta.total.gt(abonado(venta)));
}

/**
 * Reparte un abono entre las ventas a crédito pendientes del cliente.
 *
 * Con `saleTransactionId` va completo a esa venta; sin él, de la más antigua a la más
 * reciente, que es como el cliente entiende que va pagando. Nunca deja saldo a favor:
 * un abono mayor que lo que se debe se rechaza, porque ese dinero no tendría a qué
 * aplicarse y el estado de cuenta quedaría en negativo.
 */
export function distribuirAbono(
  pendientes: Array<{ id: string; saldo: Prisma.Decimal }>,
  monto: Prisma.Decimal,
  saleTransactionId?: string,
): Array<{ saleTransactionId: string; monto: Prisma.Decimal }> {
  const candidatas = saleTransactionId ? pendientes.filter((venta) => venta.id === saleTransactionId) : pendientes;

  if (saleTransactionId && candidatas.length === 0) {
    throw new ReceivableError('Esa venta no tiene saldo pendiente para este cliente', 409, 'CONFLICT');
  }

  const deuda = candidatas.reduce((suma, venta) => suma.add(venta.saldo), ZERO);
  if (deuda.eq(0)) {
    throw new ReceivableError('El cliente no tiene ventas a crédito pendientes', 409, 'CONFLICT');
  }
  if (monto.gt(deuda)) {
    throw new ReceivableError(
      `El abono (L ${monto.toFixed(2)}) es mayor que el saldo pendiente (L ${deuda.toFixed(2)})`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const aplicaciones: Array<{ saleTransactionId: string; monto: Prisma.Decimal }> = [];
  let restante = monto;
  for (const venta of candidatas) {
    if (restante.lte(0)) break;
    const parte = Prisma.Decimal.min(restante, venta.saldo);
    aplicaciones.push({ saleTransactionId: venta.id, monto: parte });
    restante = restante.sub(parte);
  }
  return aplicaciones;
}

/**
 * Bloquea la fila del cliente hasta el fin de la transacción. Dos abonos registrados
 * a la vez leerían el mismo saldo y podrían pagar dos veces la misma factura.
 */
export async function lockClient(db: Prisma.TransactionClient, clientId: string) {
  await db.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;
}

/** Lo ya abonado a una venta. Lo usan las rutas que cambian o borran una venta. */
export async function totalAbonadoVenta(db: DbClient, saleTransactionId: string) {
  const agg = await db.clientPaymentApplication.aggregate({
    where: { saleTransactionId },
    _sum: { monto: true },
  });
  return agg._sum.monto ?? ZERO;
}

export const clientPaymentInclude = {
  client: { select: { nombre: true } },
  aplicaciones: {
    select: { monto: true, saleTransaction: { select: { id: true, numeroInterno: true } } },
  },
} as const;

export function mapClientPayment(
  payment: Prisma.ClientPaymentGetPayload<{ include: typeof clientPaymentInclude }>,
): ClientPaymentDTO {
  return {
    id: payment.id,
    businessDate: toBusinessDateString(payment.businessDate),
    sucursalId: payment.sucursalId,
    clientId: payment.clientId,
    clientNombre: payment.client.nombre,
    metodoPago: payment.metodoPago,
    monto: Number(payment.monto),
    referencia: payment.referencia,
    notas: payment.notas,
    registradoPor: payment.registradoPor,
    createdAt: payment.createdAt.toISOString(),
    aplicaciones: payment.aplicaciones.map((aplicacion) => ({
      saleTransactionId: aplicacion.saleTransaction.id,
      numeroInterno: formatNumeroInterno('venta', aplicacion.saleTransaction.numeroInterno),
      monto: Number(aplicacion.monto),
    })),
  };
}

/**
 * Clientes que deben algo, con su saldo y la antigüedad de la deuda. El saldo es del
 * cliente, no de una bodega: puede comprar en una y pagar en otra.
 */
export async function getReceivablesSummary(db: DbClient, hoy: string): Promise<ReceivableClientDTO[]> {
  const ventas = await db.saleTransaction.findMany({
    where: { metodoPago: CREDIT_SALE_METHOD },
    orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    select: { ...creditSaleSelect, client: { select: { nombre: true } } },
  });

  const porCliente = new Map<string, ReceivableClientDTO>();
  for (const venta of ventas) {
    const fila = mapReceivableSale(venta, hoy);
    if (fila.saldo <= 0) continue;

    const actual = porCliente.get(venta.clientId) ?? {
      clientId: venta.clientId,
      clientNombre: venta.client.nombre,
      ventasPendientes: 0,
      totalCredito: 0,
      totalAbonado: 0,
      saldo: 0,
      ventaMasAntigua: fila.businessDate,
      diasMasAntigua: fila.dias,
    };
    actual.ventasPendientes += 1;
    actual.totalCredito = round(actual.totalCredito + fila.total);
    actual.totalAbonado = round(actual.totalAbonado + fila.abonado);
    actual.saldo = round(actual.saldo + fila.saldo);
    porCliente.set(venta.clientId, actual);
  }

  return [...porCliente.values()].sort((a, b) => b.saldo - a.saldo);
}

/**
 * Estado de cuenta de un cliente: cargos (ventas a crédito) y abonos, con el saldo
 * corrido. Lo anterior a `desde` entra como saldo anterior; las facturas pendientes
 * se listan al día de hoy, sin importar el rango.
 */
export async function getAccountStatement(
  db: DbClient,
  clientId: string,
  options: { desde?: string | null; hasta?: string | null; hoy: string },
): Promise<AccountStatementDTO | null> {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const desde = options.desde ? parseBusinessDate(options.desde) : null;
  const hasta = options.hasta ? parseBusinessDate(options.hasta) : null;
  const rango = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };

  const [ventas, abonos, ventasAnteriores, abonosAnteriores, pendientes] = await Promise.all([
    db.saleTransaction.findMany({
      where: { clientId, metodoPago: CREDIT_SALE_METHOD, businessDate: rango },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
      select: creditSaleSelect,
    }),
    db.clientPayment.findMany({
      where: { clientId, businessDate: rango },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
      include: clientPaymentInclude,
    }),
    desde
      ? db.saleTransaction.aggregate({
          where: { clientId, metodoPago: CREDIT_SALE_METHOD, businessDate: { lt: desde } },
          _sum: { total: true },
        })
      : null,
    desde
      ? db.clientPayment.aggregate({ where: { clientId, businessDate: { lt: desde } }, _sum: { monto: true } })
      : null,
    findPendingCreditSales(db, clientId),
  ]);

  const saldoAnterior = round(
    Number(ventasAnteriores?._sum.total ?? 0) - Number(abonosAnteriores?._sum.monto ?? 0),
  );

  const movimientos: Array<Omit<AccountStatementMovementDTO, 'saldo'> & { orden: number }> = [
    ...ventas.map((venta) => ({
      tipo: 'venta' as const,
      id: venta.id,
      businessDate: toBusinessDateString(venta.businessDate),
      documento: formatNumeroInterno('venta', venta.numeroInterno),
      detalle: venta.fiscalDocument?.estado === 'emitido' ? `Factura ${venta.fiscalDocument.numeroCompleto}` : 'Venta al crédito',
      cargo: Number(venta.total),
      abono: 0,
      orden: venta.createdAt.getTime(),
    })),
    ...abonos.map((pago) => {
      const dto = mapClientPayment(pago);
      const aplicadoA = dto.aplicaciones.map((aplicacion) => aplicacion.numeroInterno).join(', ');
      return {
        tipo: 'abono' as const,
        id: pago.id,
        businessDate: dto.businessDate,
        documento: dto.referencia ?? '—',
        detalle: [`Abono (${paymentMethodLabel(dto.metodoPago).toLowerCase()})`,aplicadoA ? `a ${aplicadoA}` : null, dto.notas].filter(Boolean).join(' · '),
        cargo: 0,
        abono: dto.monto,
        orden: pago.createdAt.getTime(),
      };
    }),
  ].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.orden - b.orden);

  let saldo = saldoAnterior;
  const conSaldo: AccountStatementMovementDTO[] = movimientos.map((movimiento) => {
    saldo = round(saldo + movimiento.cargo - movimiento.abono);
    return {
      tipo: movimiento.tipo,
      id: movimiento.id,
      businessDate: movimiento.businessDate,
      documento: movimiento.documento,
      detalle: movimiento.detalle,
      cargo: movimiento.cargo,
      abono: movimiento.abono,
      saldo,
    };
  });

  const totalCargos = round(conSaldo.reduce((suma, movimiento) => suma + movimiento.cargo, 0));
  const totalAbonos = round(conSaldo.reduce((suma, movimiento) => suma + movimiento.abono, 0));

  return {
    client: {
      id: client.id,
      nombre: client.nombre,
      rtn: client.rtn,
      telefono: client.telefono,
      claveIhcafe: client.claveIhcafe,
    },
    desde: options.desde ?? null,
    hasta: options.hasta ?? null,
    saldoAnterior,
    totalCargos,
    totalAbonos,
    saldoFinal: round(saldoAnterior + totalCargos - totalAbonos),
    movimientos: conSaldo,
    pendientes: pendientes.map((venta) => mapReceivableSale(venta, options.hoy)),
    saldoActual: round(pendientes.reduce((suma, venta) => suma + Number(venta.total.sub(abonado(venta))), 0)),
  };
}
