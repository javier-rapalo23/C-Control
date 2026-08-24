import { Prisma, PrismaClient } from '@prisma/client';
import { parseBusinessDate, toBusinessDateString } from '@/lib/business-date';
import { decimalToNumber, recalculateDailyBalance } from '@/lib/ledger';
import type { CashSessionDTO } from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

export const CASH_SESSION_ESTADOS = ['abierta', 'cerrada'] as const;
export type CashSessionEstado = (typeof CASH_SESSION_ESTADOS)[number];

/**
 * Se lanza al intentar escribir sobre una fecha con la caja cerrada. Lleva su
 * propio tipo para que la API pueda responder 409 en vez del 400 genérico: no es
 * un payload inválido, es un estado que impide la operación.
 */
export class CashClosedError extends Error {
  readonly businessDate: string;

  constructor(businessDate: string) {
    super(`La caja del ${businessDate} está cerrada. Un administrador debe reabrirla para registrar movimientos.`);
    this.name = 'CashClosedError';
    this.businessDate = businessDate;
  }
}

export function mapCashSession(session: {
  id: string;
  businessDate: Date;
  sucursalId: string;
  estado: string;
  montoApertura: Prisma.Decimal;
  abiertaPor: string;
  abiertaAt: Date;
  montoContado: Prisma.Decimal | null;
  saldoEsperado: Prisma.Decimal | null;
  diferencia: Prisma.Decimal | null;
  cerradaPor: string | null;
  cerradaAt: Date | null;
  notas: string | null;
}): CashSessionDTO {
  return {
    id: session.id,
    businessDate: toBusinessDateString(session.businessDate),
    sucursalId: session.sucursalId,
    estado: session.estado as CashSessionEstado,
    montoApertura: decimalToNumber(session.montoApertura),
    abiertaPor: session.abiertaPor,
    abiertaAt: session.abiertaAt.toISOString(),
    montoContado: session.montoContado !== null ? decimalToNumber(session.montoContado) : null,
    saldoEsperado: session.saldoEsperado !== null ? decimalToNumber(session.saldoEsperado) : null,
    diferencia: session.diferencia !== null ? decimalToNumber(session.diferencia) : null,
    cerradaPor: session.cerradaPor,
    cerradaAt: session.cerradaAt?.toISOString() ?? null,
    notas: session.notas,
  };
}

export async function getCashSession(db: DbClient, businessDateInput: string, sucursalId: string) {
  return db.cashSession.findUnique({
    where: {
      businessDate_sucursalId: { businessDate: parseBusinessDate(businessDateInput), sucursalId },
    },
  });
}

/**
 * Punto único de control de escritura sobre el ledger.
 *
 * **Solo una caja explícitamente cerrada bloquea.** La ausencia de sesión no
 * impide nada: abrir caja es opcional, así que activar esta funcionalidad no
 * detiene la operación de quien nunca la use.
 */
export async function assertCashOpen(db: DbClient, businessDateInput: string, sucursalId: string): Promise<void> {
  const session = await getCashSession(db, businessDateInput, sucursalId);
  if (session?.estado === 'cerrada') {
    throw new CashClosedError(businessDateInput);
  }
}

export async function openCashSession(
  db: DbClient,
  input: { businessDate: string; sucursalId: string; montoApertura: number; abiertaPor: string; notas?: string | null },
) {
  const businessDate = parseBusinessDate(input.businessDate);
  const existing = await getCashSession(db, input.businessDate, input.sucursalId);

  if (existing?.estado === 'abierta') {
    throw new Error('La caja de esta fecha ya está abierta.');
  }
  if (existing?.estado === 'cerrada') {
    throw new Error('La caja de esta fecha ya fue cerrada. Un administrador debe reabrirla.');
  }

  const session = await db.cashSession.create({
    data: {
      businessDate,
      sucursalId: input.sucursalId,
      estado: 'abierta',
      montoApertura: input.montoApertura,
      abiertaPor: input.abiertaPor,
      notas: input.notas ?? null,
    },
  });

  // La apertura fija el saldo inicial del día: es el efectivo con el que se arranca.
  await db.dailyBalance.upsert({
    where: { businessDate_sucursalId: { businessDate, sucursalId: input.sucursalId } },
    update: { saldoInicial: input.montoApertura },
    create: { businessDate, sucursalId: input.sucursalId, saldoInicial: input.montoApertura, saldoActual: input.montoApertura },
  });
  await recalculateDailyBalance(db, input.businessDate, input.sucursalId);

  return session;
}

export async function closeCashSession(
  db: DbClient,
  input: { businessDate: string; sucursalId: string; montoContado: number; cerradaPor: string; notas?: string | null },
) {
  const existing = await getCashSession(db, input.businessDate, input.sucursalId);
  if (!existing) {
    throw new Error('No hay caja abierta para esta fecha.');
  }
  if (existing.estado === 'cerrada') {
    throw new Error('La caja de esta fecha ya está cerrada.');
  }

  const businessDate = parseBusinessDate(input.businessDate);

  // El ajuste se pone en cero antes de medir: así el esperado es siempre el saldo
  // teórico limpio, incluso si esta fecha ya se había cerrado y se reabrió.
  await db.dailyBalance.updateMany({
    where: { businessDate, sucursalId: input.sucursalId },
    data: { ajusteCaja: 0 },
  });

  // Se recalcula en el momento del cierre para que el esperado refleje el último
  // movimiento registrado, no una cifra que la UI pudiera traer desactualizada.
  const { totals } = await recalculateDailyBalance(db, input.businessDate, input.sucursalId);
  const saldoEsperado = totals.saldoActual;
  const diferencia = Number((input.montoContado - saldoEsperado).toFixed(2));

  // El descuadre se lleva al balance: tras el cierre, `saldoActual` es el efectivo
  // contado. Sin esto el arqueo quedaba documentado pero el saldo seguía siendo
  // el teórico, y el día siguiente arrancaba de una cifra que nadie tenía en mano.
  await db.dailyBalance.updateMany({
    where: { businessDate, sucursalId: input.sucursalId },
    data: { ajusteCaja: diferencia },
  });
  await recalculateDailyBalance(db, input.businessDate, input.sucursalId);

  return db.cashSession.update({
    where: { id: existing.id },
    data: {
      estado: 'cerrada',
      montoContado: input.montoContado,
      saldoEsperado,
      diferencia,
      cerradaPor: input.cerradaPor,
      cerradaAt: new Date(),
      ...(input.notas ? { notas: input.notas } : {}),
    },
  });
}

export async function reopenCashSession(
  db: DbClient,
  input: { businessDate: string; sucursalId: string; reabiertaPor: string },
) {
  const existing = await getCashSession(db, input.businessDate, input.sucursalId);
  if (!existing) {
    throw new Error('No existe una caja para esta fecha.');
  }
  if (existing.estado === 'abierta') {
    throw new Error('La caja de esta fecha ya está abierta.');
  }

  // Se conserva el arqueo anterior en `notas` para no perder el rastro de que
  // hubo un cierre con una diferencia determinada antes de la corrección.
  const rastro = `Reabierta por ${input.reabiertaPor} el ${new Date().toISOString()} (cierre previo: contado ${decimalToNumber(existing.montoContado)}, esperado ${decimalToNumber(existing.saldoEsperado)}, diferencia ${decimalToNumber(existing.diferencia)})`;

  // Al reabrir se revierte el ajuste: el saldo vuelve a ser el teórico mientras la
  // caja siga abierta, y el próximo cierre lo fijará de nuevo con su propio conteo.
  await db.dailyBalance.updateMany({
    where: { businessDate: parseBusinessDate(input.businessDate), sucursalId: input.sucursalId },
    data: { ajusteCaja: 0 },
  });
  await recalculateDailyBalance(db, input.businessDate, input.sucursalId);

  return db.cashSession.update({
    where: { id: existing.id },
    data: {
      estado: 'abierta',
      montoContado: null,
      saldoEsperado: null,
      diferencia: null,
      cerradaPor: null,
      cerradaAt: null,
      notas: existing.notas ? `${existing.notas}\n${rastro}` : rastro,
    },
  });
}
