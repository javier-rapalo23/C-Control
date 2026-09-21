'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CashSessionDTO, LedgerDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';
import PendingPaymentsSection from '@/components/pending-payments-section';

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

  const [ingresoMonto, setIngresoMonto] = useState('');
  const [ingresoDescripcion, setIngresoDescripcion] = useState('');
  const [savingIngreso, setSavingIngreso] = useState(false);
  const [deletingIngresoId, setDeletingIngresoId] = useState<string | null>(null);

  const [salidaMonto, setSalidaMonto] = useState('');
  const [salidaDescripcion, setSalidaDescripcion] = useState('');
  const [savingSalida, setSavingSalida] = useState(false);
  const [deletingSalidaId, setDeletingSalidaId] = useState<string | null>(null);

  const [trasladoDestinoId, setTrasladoDestinoId] = useState('');
  const [trasladoMonto, setTrasladoMonto] = useState('');
  const [trasladoDescripcion, setTrasladoDescripcion] = useState('');
  const [savingTraslado, setSavingTraslado] = useState(false);
  const [deletingTrasladoId, setDeletingTrasladoId] = useState<string | null>(null);

  const otrasBodegas = sucursales.filter((sucursal) => sucursal.id !== sucursalId);
  // El destino nunca puede ser la bodega que envía: al cambiar de bodega arriba se
  // corrige solo en vez de dejar un destino inválido seleccionado.
  const destinoValido = otrasBodegas.some((sucursal) => sucursal.id === trasladoDestinoId);
  const primerDestinoId = otrasBodegas[0]?.id ?? '';
  useEffect(() => {
    if (!destinoValido) setTrasladoDestinoId(primerDestinoId);
  }, [destinoValido, primerDestinoId]);

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

  async function registrarIngreso(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSavingIngreso(true);
      setError(null);
      await fetch('/api/cash-entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          descripcion: ingresoDescripcion,
          monto: Number(ingresoMonto),
        }),
      }).then(parseApiResponse);

      setIngresoMonto('');
      setIngresoDescripcion('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el ingreso');
    } finally {
      setSavingIngreso(false);
    }
  }

  async function eliminarIngreso(id: string) {
    try {
      setDeletingIngresoId(id);
      setError(null);
      await fetch(`/api/cash-entries/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando el ingreso');
    } finally {
      setDeletingIngresoId(null);
    }
  }

  async function registrarSalida(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSavingSalida(true);
      setError(null);
      await fetch('/api/cash-withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          descripcion: salidaDescripcion,
          monto: Number(salidaMonto),
        }),
      }).then(parseApiResponse);

      setSalidaMonto('');
      setSalidaDescripcion('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando la salida');
    } finally {
      setSavingSalida(false);
    }
  }

  async function eliminarSalida(id: string) {
    try {
      setDeletingSalidaId(id);
      setError(null);
      await fetch(`/api/cash-withdrawals/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando la salida');
    } finally {
      setDeletingSalidaId(null);
    }
  }

  async function registrarTraslado(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSavingTraslado(true);
      setError(null);
      await fetch('/api/cash-transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalOrigenId: sucursalId,
          sucursalDestinoId: trasladoDestinoId,
          descripcion: trasladoDescripcion.trim() || undefined,
          monto: Number(trasladoMonto),
        }),
      }).then(parseApiResponse);

      setTrasladoMonto('');
      setTrasladoDescripcion('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el traslado');
    } finally {
      setSavingTraslado(false);
    }
  }

  async function eliminarTraslado(id: string) {
    try {
      setDeletingTrasladoId(id);
      setError(null);
      await fetch(`/api/cash-transfers/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando el traslado');
    } finally {
      setDeletingTrasladoId(null);
    }
  }

  const saldoEsperado = ledger?.totals.saldoActual ?? 0;
  const cashEntries = ledger?.cashEntries ?? [];
  const totalIngresos = ledger?.totals.totalIngresos ?? 0;
  const cashWithdrawals = ledger?.cashWithdrawals ?? [];
  const totalSalidas = ledger?.totals.totalSalidas ?? 0;
  const cashTransfers = ledger?.cashTransfers ?? [];
  const totalTrasladosRecibidos = ledger?.totals.totalTrasladosRecibidos ?? 0;
  const totalTrasladosEnviados = ledger?.totals.totalTrasladosEnviados ?? 0;
  const cajaCerrada = session?.estado === 'cerrada';
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

      <ErrorToast message={error} onClose={() => setError(null)} />

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

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Ingresar efectivo</h3>
        <p style={{ color: 'var(--text-soft)' }}>
          Efectivo que entra a la caja sin ser una venta: reposición del dueño, retiro del banco para
          tener cambio, devolución de un anticipo. Suma al saldo del día.
        </p>

        <form onSubmit={(event) => void registrarIngreso(event)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input
              type="number"
              step="0.01"
              min="0"
              value={ingresoMonto}
              onChange={(event) => setIngresoMonto(event.target.value)}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 8' }}>
            Concepto
            <input
              value={ingresoDescripcion}
              onChange={(event) => setIngresoDescripcion(event.target.value)}
              placeholder="Ej. Retiro del banco para cambio"
              required
            />
          </label>
          <div style={{ gridColumn: 'span 12' }}>
            <button
              className="btn-primary"
              type="submit"
              disabled={savingIngreso || cajaCerrada || ingresoMonto === '' || ingresoDescripcion.trim() === ''}
            >
              {savingIngreso ? 'Guardando...' : 'Registrar ingreso'}
            </button>
            {cajaCerrada ? (
              <span style={{ marginLeft: 8, color: 'var(--text-soft)' }}>
                La caja de esta fecha está cerrada.
              </span>
            ) : null}
          </div>
        </form>

        <table className="table-like" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {cashEntries.map((entry) => (
              <tr key={entry.id} style={{ opacity: deletingIngresoId === entry.id ? 0.5 : 1 }}>
                <td>{entry.descripcion}</td>
                <td>{money(entry.monto)}</td>
                <td>
                  <button
                    className="btn-danger"
                    type="button"
                    disabled={deletingIngresoId !== null || cajaCerrada}
                    onClick={() => void eliminarIngreso(entry.id)}
                  >
                    {deletingIngresoId === entry.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            ))}
            {cashEntries.length === 0 ? (
              <tr>
                <td colSpan={3}>No hay ingresos de efectivo en esta fecha.</td>
              </tr>
            ) : (
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td colSpan={2}>
                  <strong>{money(totalIngresos)}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Retirar efectivo</h3>
        <p style={{ color: 'var(--text-soft)' }}>
          Efectivo que sale de la caja sin ser una compra ni un gasto: retiro del dueño, depósito del
          sobrante al banco. Resta del saldo del día.
        </p>

        <form onSubmit={(event) => void registrarSalida(event)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input
              type="number"
              step="0.01"
              min="0"
              value={salidaMonto}
              onChange={(event) => setSalidaMonto(event.target.value)}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 8' }}>
            Concepto
            <input
              value={salidaDescripcion}
              onChange={(event) => setSalidaDescripcion(event.target.value)}
              placeholder="Ej. Depósito del sobrante al banco"
              required
            />
          </label>
          <div style={{ gridColumn: 'span 12' }}>
            <button
              className="btn-primary"
              type="submit"
              disabled={savingSalida || cajaCerrada || salidaMonto === '' || salidaDescripcion.trim() === ''}
            >
              {savingSalida ? 'Guardando...' : 'Registrar salida'}
            </button>
            {cajaCerrada ? (
              <span style={{ marginLeft: 8, color: 'var(--text-soft)' }}>
                La caja de esta fecha está cerrada.
              </span>
            ) : null}
          </div>
        </form>

        <table className="table-like" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {cashWithdrawals.map((withdrawal) => (
              <tr key={withdrawal.id} style={{ opacity: deletingSalidaId === withdrawal.id ? 0.5 : 1 }}>
                <td>{withdrawal.descripcion}</td>
                <td>{money(withdrawal.monto)}</td>
                <td>
                  <button
                    className="btn-danger"
                    type="button"
                    disabled={deletingSalidaId !== null || cajaCerrada}
                    onClick={() => void eliminarSalida(withdrawal.id)}
                  >
                    {deletingSalidaId === withdrawal.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            ))}
            {cashWithdrawals.length === 0 ? (
              <tr>
                <td colSpan={3}>No hay salidas de efectivo en esta fecha.</td>
              </tr>
            ) : (
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td colSpan={2}>
                  <strong>{money(totalSalidas)}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Traslado entre bodegas</h3>
        <p style={{ color: 'var(--text-soft)' }}>
          Efectivo que esta bodega le manda a otra. Resta del saldo de esta bodega y suma al de la que
          lo recibe, en la misma fecha. Las cajas de las dos bodegas deben estar abiertas.
        </p>

        {otrasBodegas.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>
            No hay otra bodega activa a la que trasladar efectivo.
          </p>
        ) : (
          <form onSubmit={(event) => void registrarTraslado(event)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 4' }}>
              Enviar a
              <select value={trasladoDestinoId} onChange={(event) => setTrasladoDestinoId(event.target.value)}>
                {otrasBodegas.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: 'span 3' }}>
              Monto
              <input
                type="number"
                step="0.01"
                min="0"
                value={trasladoMonto}
                onChange={(event) => setTrasladoMonto(event.target.value)}
                required
              />
            </label>
            <label style={{ gridColumn: 'span 5' }}>
              Concepto (opcional)
              <input
                value={trasladoDescripcion}
                onChange={(event) => setTrasladoDescripcion(event.target.value)}
                placeholder="Ej. Efectivo para compras de la semana"
              />
            </label>
            <div style={{ gridColumn: 'span 12' }}>
              <button
                className="btn-primary"
                type="submit"
                disabled={savingTraslado || cajaCerrada || trasladoMonto === '' || !destinoValido}
              >
                {savingTraslado ? 'Guardando...' : 'Registrar traslado'}
              </button>
              {cajaCerrada ? (
                <span style={{ marginLeft: 8, color: 'var(--text-soft)' }}>
                  La caja de esta fecha está cerrada.
                </span>
              ) : null}
            </div>
          </form>
        )}

        <table className="table-like" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Movimiento</th>
              <th>Concepto</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {cashTransfers.map((transfer) => {
              const enviado = transfer.sucursalOrigenId === sucursalId;
              return (
                <tr key={transfer.id} style={{ opacity: deletingTrasladoId === transfer.id ? 0.5 : 1 }}>
                  <td>
                    {enviado
                      ? `Enviado a ${transfer.sucursalDestinoNombre}`
                      : `Recibido de ${transfer.sucursalOrigenNombre}`}
                  </td>
                  <td>{transfer.descripcion ?? '—'}</td>
                  <td style={{ color: enviado ? 'var(--danger)' : undefined }}>
                    {enviado ? '−' : '+'} {money(transfer.monto)}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      type="button"
                      disabled={deletingTrasladoId !== null || cajaCerrada}
                      onClick={() => void eliminarTraslado(transfer.id)}
                    >
                      {deletingTrasladoId === transfer.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {cashTransfers.length === 0 ? (
              <tr>
                <td colSpan={4}>No hay traslados en esta fecha.</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td colSpan={2}>
                    <strong>Total recibido</strong>
                  </td>
                  <td colSpan={2}>
                    <strong>{money(totalTrasladosRecibidos)}</strong>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <strong>Total enviado</strong>
                  </td>
                  <td colSpan={2}>
                    <strong>{money(totalTrasladosEnviados)}</strong>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      <PendingPaymentsSection
        businessDate={businessDate}
        sucursalId={sucursalId}
        cajaCerrada={cajaCerrada}
        onChanged={fetchAll}
      />

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

      <LoadingOverlay
        active={
          loading ||
          savingIngreso ||
          savingSalida ||
          savingTraslado ||
          deletingIngresoId !== null ||
          deletingSalidaId !== null ||
          deletingTrasladoId !== null
        }
      />
    </>
  );
}
