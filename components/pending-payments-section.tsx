'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { PendingPaymentDTO } from '@/types/domain';
import { CASH_PAYMENT_METHOD, SETTLEMENT_METHODS, paymentMethodLabel, type PaymentMethod } from '@/lib/payment-methods';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const money = (value: number) => `L ${value.toFixed(2)}`;

/** Días entre dos fechas `YYYY-MM-DD`, sin que la zona horaria mueva el resultado. */
function daysBetween(from: string, to: string) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

type Props = {
  businessDate: string;
  sucursalId: string;
  cajaCerrada: boolean;
  /** Para que el panel de caja recargue el saldo después de pagar o deshacer. */
  onChanged: () => void | Promise<void>;
};

/**
 * Compras registradas como "Pendiente de pago" en Compras. Se pagan desde aquí,
 * en la caja de la fecha seleccionada: si el pago es en efectivo, resta del saldo
 * de ese día y no del día en que se compró.
 */
export default function PendingPaymentsSection({ businessDate, sucursalId, cajaCerrada, onChanged }: Props) {
  const [pendientes, setPendientes] = useState<PendingPaymentDTO[]>([]);
  const [pagados, setPagados] = useState<PendingPaymentDTO[]>([]);
  const [metodos, setMetodos] = useState<Record<string, PaymentMethod>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const data = await fetch(`/api/pending-payments?sucursalId=${sucursalId}&businessDate=${businessDate}`, {
        cache: 'no-store',
      }).then(parseApiResponse<{ pendientes: PendingPaymentDTO[]; pagados: PendingPaymentDTO[] }>);
      setPendientes(data.pendientes);
      setPagados(data.pagados);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando pagos pendientes');
    } finally {
      setLoading(false);
    }
  }, [businessDate, sucursalId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function pagar(item: PendingPaymentDTO) {
    try {
      setBusyId(item.id);
      setError(null);
      await fetch(`/api/pending-payments/${item.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, metodoPago: metodos[item.id] ?? CASH_PAYMENT_METHOD }),
      }).then(parseApiResponse);
      await Promise.all([fetchData(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el pago');
    } finally {
      setBusyId(null);
    }
  }

  async function deshacer(item: PendingPaymentDTO) {
    try {
      setBusyId(item.id);
      setError(null);
      await fetch(`/api/pending-payments/${item.id}`, { method: 'DELETE' }).then(parseApiResponse);
      await Promise.all([fetchData(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deshaciendo el pago');
    } finally {
      setBusyId(null);
    }
  }

  const totalPendiente = pendientes.reduce((sum, item) => sum + item.total, 0);
  const pagadoEfectivo = pagados
    .filter((item) => item.pagoMetodo === CASH_PAYMENT_METHOD)
    .reduce((sum, item) => sum + item.total, 0);
  // Una compra de hoy no puede pagarse "otro día" en una caja anterior a ella.
  const pagables = pendientes.filter((item) => item.businessDate <= businessDate);

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <ErrorToast message={error} onClose={() => setError(null)} />
      <LoadingOverlay active={loading || busyId !== null} />

      <h3>Pagos pendientes</h3>
      <p style={{ color: 'var(--text-soft)' }}>
        Compras registradas como &quot;Pendiente de pago&quot;. Al pagarlas aquí quedan asentadas en la caja de
        esta fecha; si el pago es en efectivo, resta del saldo de hoy y no del día de la compra.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Fecha compra</th>
              <th>Cliente</th>
              <th>Factura</th>
              <th>Total</th>
              <th>Forma de pago</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {pagables.map((item) => {
              const dias = daysBetween(item.businessDate, businessDate);
              return (
                <tr key={item.id}>
                  <td>
                    {item.businessDate}
                    <div style={{ fontSize: 12, color: dias > 7 ? 'var(--danger)' : 'var(--text-soft)' }}>
                      {dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`}
                    </div>
                  </td>
                  <td>
                    {item.clientNombre}
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>{item.itemsCount} items</div>
                  </td>
                  <td>{item.numeroFactura ?? '—'}</td>
                  <td>
                    <strong>{money(item.total)}</strong>
                  </td>
                  <td>
                    <select
                      value={metodos[item.id] ?? CASH_PAYMENT_METHOD}
                      onChange={(event) => setMetodos((current) => ({ ...current, [item.id]: event.target.value as PaymentMethod }))}
                      disabled={cajaCerrada}
                    >
                      {SETTLEMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={busyId !== null || cajaCerrada}
                      onClick={() => void pagar(item)}
                    >
                      Pagar
                    </button>
                  </td>
                </tr>
              );
            })}
            {pagables.length === 0 ? (
              <tr>
                <td colSpan={6}>No hay compras pendientes de pago.</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={3}>
                  <strong>Total pendiente</strong>
                </td>
                <td colSpan={3}>
                  <strong>{money(totalPendiente)}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cajaCerrada ? (
        <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>La caja de esta fecha está cerrada: no se pueden registrar pagos.</p>
      ) : null}

      {pagados.length > 0 ? (
        <>
          <h4 style={{ marginTop: 16 }}>Pagados en esta fecha</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Fecha compra</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Pagado con</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {pagados.map((item) => (
                  <tr key={item.id}>
                    <td>{item.businessDate}</td>
                    <td>{item.clientNombre}</td>
                    <td>{money(item.total)}</td>
                    <td>{item.pagoMetodo ? paymentMethodLabel(item.pagoMetodo) : '—'}</td>
                    <td>
                      <button
                        className="btn-danger"
                        type="button"
                        disabled={busyId !== null || cajaCerrada}
                        onClick={() => void deshacer(item)}
                      >
                        Deshacer pago
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <strong>Salió de caja (efectivo)</strong>
                  </td>
                  <td colSpan={3}>
                    <strong>{money(pagadoEfectivo)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
