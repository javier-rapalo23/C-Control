/**
 * Catálogo de formas de pago de una compra.
 *
 * Es cerrado por la misma razón que el de categorías de gasto: de este valor
 * depende un cálculo, no solo una etiqueta. Solo `efectivo` mueve la caja —un
 * depósito o un cheque no sacan dinero de la gaveta—, así que el saldo del día
 * resta únicamente las compras pagadas en efectivo.
 */

export const CASH_PAYMENT_METHOD = 'efectivo';

/**
 * Compra que se registra hoy y se paga otro día. No toca la caja al registrarse;
 * el pago se asienta después desde Caja → Pagos pendientes, con la forma real.
 */
export const PENDING_PAYMENT_METHOD = 'pendiente';

export const PAYMENT_METHOD_VALUES = [CASH_PAYMENT_METHOD, 'deposito', 'cheque', PENDING_PAYMENT_METHOD] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export type PaymentMethodDef = {
  value: PaymentMethod;
  label: string;
  /** Si sale de la caja del día. Lo usa el ledger para decidir qué resta del saldo. */
  afectaCaja: boolean;
};

export const PAYMENT_METHODS: PaymentMethodDef[] = [
  { value: CASH_PAYMENT_METHOD, label: 'Efectivo', afectaCaja: true },
  { value: 'deposito', label: 'Depósito', afectaCaja: false },
  { value: 'cheque', label: 'Cheque', afectaCaja: false },
  { value: PENDING_PAYMENT_METHOD, label: 'Pendiente de pago', afectaCaja: false },
];

/** Tupla no vacía, que es lo que `z.enum` necesita. */
export const PAYMENT_METHOD_ENUM_VALUES = PAYMENT_METHOD_VALUES as unknown as [PaymentMethod, ...PaymentMethod[]];

/** Formas con las que se liquida una compra pendiente: todas menos "pendiente". */
export const SETTLEMENT_METHODS = PAYMENT_METHODS.filter((method) => method.value !== PENDING_PAYMENT_METHOD);

export const SETTLEMENT_METHOD_ENUM_VALUES = SETTLEMENT_METHODS.map((method) => method.value) as [
  PaymentMethod,
  ...PaymentMethod[],
];

/**
 * Las compras registradas antes de que existiera el método de pago se migraron a
 * `efectivo`, que es como se venían contando: el saldo histórico no cambia.
 */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = CASH_PAYMENT_METHOD;

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
}

export function afectaCaja(value: string): boolean {
  return PAYMENT_METHODS.find((method) => method.value === value)?.afectaCaja ?? true;
}
