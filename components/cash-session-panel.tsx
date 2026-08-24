'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CashSessionDTO, LedgerDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const money = (value: number) => `L ${value.toFixed(2)}`;

export default function CashSessionPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [session, setSession] = useState<CashSessionDTO | null>(null);
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [montoApertura, setMontoApertura] = useState('');
  const [montoContado, setMontoContado] = useState('');
  const [notas, setNotas] = useState('');

  const fetchAll = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const [sessionData, ledgerData] = await Promise.all([
        fetch(`/api/cash-sessions?businessDate=${businessDate}&sucursalId=${sucursalId}`, { cache: 'no-store' }).then(
          parseApiResponse<CashSessionDTO | null>,
        ),
        fetch(`/api/ledger?businessDate=${businessDate}&sucursalId=${sucursalId}`, { cache: 'no-store' }).then(
          parseApiResponse<LedgerDTO>,
        ),
      ]);
      setSession(sessionData);
      setLedger(ledgerData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [businessDate, sucursalId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(parseApiResponse<{ role: string | null }>)
      .then((data) => setRole(data.role))
      .catch(() => setRole(null));
  }, []);

  async function post(url: string, body: Record<string, unknown>, errorMessage: string) {
    try {
      setLoading(true);
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, sucursalId, ...body }),
      }).then(parseApiResponse);
      setNotas('');
      setMontoContado('');
      setMontoApertura('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const saldoEsperado = ledger?.totals.saldoActual ?? 0;
  // Se calcula en vivo para que el cajero vea el descuadre antes de confirmar.
  const diferenciaPrevista = montoContado === '' ? null : Number(montoContado) - saldoEsperado;

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <label style={{ gridColumn: 'span 6' }}>
            Sucursal
            <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 6' }}>
            Fecha de negocio
            <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
          </label>
        </div>
      </section>

      {error ? (
        <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>
      ) : null}

      {!session ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Abrir caja</h3>
          <p style={{ color: 'var(--text-soft)' }}>
            No hay caja registrada para esta fecha. Abrirla fija el saldo inicial del día. Mientras no se
            abra, la operación sigue funcionando con normalidad.
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 6' }}>
              Efectivo con el que se inicia
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoApertura}
                onChange={(event) => setMontoApertura(event.target.value)}
              />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Notas (opcional)
              <input value={notas} onChange={(event) => setNotas(event.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
              <button
                className="btn-primary"
                disabled={loading || montoApertura === ''}
                onClick={() => void post('/api/cash-sessions', { montoApertura: Number(montoApertura), notas: notas || undefined }, 'Error abriendo caja')}
              >
                Abrir caja
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {session?.estado === 'abierta' ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Cerrar caja</h3>
          <table className="table-like" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <td>Apertura</td>
                <td>
                  {money(session.montoApertura)} — {session.abiertaPor}
                </td>
              </tr>
              <tr>
                <td>Saldo esperado ahora</td>
                <td>
                  <strong>{money(saldoEsperado)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 6' }}>
              Efectivo contado
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoContado}
                onChange={(event) => setMontoContado(event.target.value)}
              />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Notas (opcional)
              <input value={notas} onChange={(event) => setNotas(event.target.value)} />
            </label>
          </div>

          {diferenciaPrevista !== null ? (
            <p
              style={{
                marginTop: 8,
                color: Math.abs(diferenciaPrevista) < 0.005 ? 'var(--text-soft)' : 'var(--danger)',
              }}
            >
              Diferencia: {money(diferenciaPrevista)}{' '}
              {diferenciaPrevista < 0 ? '(falta efectivo)' : diferenciaPrevista > 0 ? '(sobra efectivo)' : '(cuadra)'}
            </p>
          ) : null}

          <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>
            Al cerrar, esta fecha deja de aceptar compras, ventas y gastos, y el saldo del día pasa a
            ser el efectivo contado: la diferencia se registra como ajuste de arqueo.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 8 }}
            disabled={loading || montoContado === ''}
            onClick={() => void post('/api/cash-sessions/close', { montoContado: Number(montoContado), notas: notas || undefined }, 'Error cerrando caja')}
          >
            Cerrar caja
          </button>
        </section>
      ) : null}

      {session?.estado === 'cerrada' ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Caja cerrada</h3>
          <table className="table-like" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <td>Apertura</td>
                <td>
                  {money(session.montoApertura)} — {session.abiertaPor}
                </td>
              </tr>
              <tr>
                <td>Saldo esperado</td>
                <td>{money(session.saldoEsperado ?? 0)}</td>
              </tr>
              <tr>
                <td>Efectivo contado</td>
                <td>{money(session.montoContado ?? 0)}</td>
              </tr>
              <tr>
                <td>Diferencia</td>
                <td style={{ color: Math.abs(session.diferencia ?? 0) < 0.005 ? undefined : 'var(--danger)' }}>
                  <strong>{money(session.diferencia ?? 0)}</strong>
                </td>
              </tr>
              <tr>
                <td>Cerrada por</td>
                <td>{session.cerradaPor}</td>
              </tr>
              <tr>
                <td>Saldo del día</td>
                <td>
                  {money(saldoEsperado)}
                  {ledger && ledger.totals.ajusteCaja !== 0 ? (
                    <span style={{ color: 'var(--text-soft)' }}> (ya incluye el ajuste del arqueo)</span>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>

          {session.notas ? (
            <p style={{ color: 'var(--text-soft)', marginTop: 8, whiteSpace: 'pre-line' }}>{session.notas}</p>
          ) : null}

          {role === 'admin' ? (
            <button
              className="btn-danger"
              style={{ marginTop: 8 }}
              disabled={loading}
              onClick={() => void post('/api/cash-sessions/reopen', {}, 'Error reabriendo caja')}
            >
              Reabrir caja
            </button>
          ) : (
            <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>
              Solo un administrador puede reabrir esta fecha.
            </p>
          )}
        </section>
      ) : null}

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </>
  );
}
