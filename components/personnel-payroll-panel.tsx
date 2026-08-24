'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { PayrollPreviewDTO } from '@/types/domain';
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

function startOfWeek(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  return parsed.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

const money = (value: number) => `L ${value.toFixed(2)}`;

export default function PersonnelPayrollPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const today = todayDateString();

  const [from, setFrom] = useState(startOfWeek(today));
  const [to, setTo] = useState(addDays(startOfWeek(today), 6));
  const [preview, setPreview] = useState<PayrollPreviewDTO | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ from, to, sucursalId });
      const data = await parseApiResponse<PayrollPreviewDTO>(
        await fetch(`/api/employees/payroll?${params}`, { cache: 'no-store' }),
      );
      setPreview(data);
      // Se preseleccionan solo las líneas pagables: las que ya se pagaron o no
      // tienen monto no deberían enviarse por descuido.
      setSelected(new Set(data.lines.filter((line) => !line.yaPagado && line.subtotal > 0).map((line) => line.employeeId)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [from, to, sucursalId]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  function toggle(employeeId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  async function confirmar() {
    try {
      setLoading(true);
      setConfirmacion(null);
      const result = await parseApiResponse<{ pagos: number; totalNeto: number; label: string }>(
        await fetch('/api/employees/payroll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from, to, sucursalId, employeeIds: [...selected] }),
        }),
      );
      setConfirmacion(`Planilla ${result.label} confirmada: ${result.pagos} pago(s) por ${money(result.totalNeto)}.`);
      setError(null);
      await fetchPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error confirmando planilla');
    } finally {
      setLoading(false);
    }
  }

  const seleccionadas = preview?.lines.filter((line) => selected.has(line.employeeId)) ?? [];
  const netoSeleccionado = seleccionadas.reduce((sum, line) => sum + line.neto, 0);
  const puedeConfirmar = seleccionadas.length > 0 && seleccionadas.every((line) => !line.yaPagado && line.subtotal > 0);

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <label style={{ gridColumn: 'span 4' }}>
            Sucursal
            <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Desde (domingo)
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Hasta (sábado)
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setFrom(startOfWeek(today));
              setTo(addDays(startOfWeek(today), 6));
            }}
          >
            Semana actual
          </button>
          <button
            onClick={() => {
              const start = addDays(startOfWeek(today), -7);
              setFrom(start);
              setTo(addDays(start, 6));
            }}
          >
            Semana pasada
          </button>
        </div>
        <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>
          El cálculo es salario diario × días con asistencia registrada, menos los anticipos pendientes.
        </p>
      </section>

      {error ? <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p> : null}
      {confirmacion ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>{confirmacion}</p> : null}

      {preview ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Planilla {preview.label}</h3>
          <table className="table-like" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Pagar</th>
                <th>Empleado</th>
                <th>Días</th>
                <th>Salario/día</th>
                <th>Subtotal</th>
                <th>Anticipos</th>
                <th>Neto</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.employeeId} style={line.yaPagado ? { color: 'var(--text-soft)' } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(line.employeeId)}
                      disabled={line.yaPagado || line.subtotal <= 0}
                      onChange={() => toggle(line.employeeId)}
                    />
                  </td>
                  <td>
                    {line.employeeNombre}
                    {line.yaPagado ? ' — ya pagada' : ''}
                    {line.advertencia ? (
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.85em' }}>{line.advertencia}</div>
                    ) : null}
                  </td>
                  <td>{line.diasTrabajados}</td>
                  <td>{line.salarioDiario !== null ? money(line.salarioDiario) : '—'}</td>
                  <td>{money(line.subtotal)}</td>
                  <td>
                    {money(line.adelantosAplicados)}
                    {line.adelantoRemanente > 0 ? (
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.85em' }}>
                        queda {money(line.adelantoRemanente)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <strong>{money(line.neto)}</strong>
                  </td>
                </tr>
              ))}
              {preview.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--text-soft)' }}>
                    No hay empleados activos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <p style={{ marginTop: 12 }}>
            Seleccionados: {seleccionadas.length} · Neto a pagar: <strong>{money(netoSeleccionado)}</strong>
          </p>
          <p style={{ color: 'var(--text-soft)' }}>
            Al confirmar se registran los pagos, se descuentan los anticipos y se genera un gasto en caja
            por el total.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 8 }}
            disabled={loading || !puedeConfirmar}
            onClick={() => void confirmar()}
          >
            Confirmar planilla
          </button>
        </section>
      ) : null}

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </>
  );
}
