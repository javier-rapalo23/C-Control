'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { PurchaseReportDTO } from '@/types/domain';
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

/** Domingo de la semana de una fecha, replicando `startOfBusinessWeek` en cliente. */
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
const number = (value: number) => value.toLocaleString('es-HN', { maximumFractionDigits: 2 });

export default function ReportsPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const today = todayDateString();

  const [from, setFrom] = useState(startOfWeek(today));
  const [to, setTo] = useState(addDays(startOfWeek(today), 6));
  const [groupBy, setGroupBy] = useState<'day' | 'week'>('day');
  const [report, setReport] = useState<PurchaseReportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ from, to, groupBy, sucursalId });
      const data = await parseApiResponse<PurchaseReportDTO>(
        await fetch(`/api/reports/purchases?${params}`, { cache: 'no-store' }),
      );
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy, sucursalId]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  function setPreset(preset: 'thisWeek' | 'lastWeek' | 'last30') {
    if (preset === 'thisWeek') {
      setFrom(startOfWeek(today));
      setTo(addDays(startOfWeek(today), 6));
      setGroupBy('day');
      return;
    }
    if (preset === 'lastWeek') {
      const start = addDays(startOfWeek(today), -7);
      setFrom(start);
      setTo(addDays(start, 6));
      setGroupBy('day');
      return;
    }
    setFrom(addDays(today, -29));
    setTo(today);
    setGroupBy('week');
  }

  return (
    <main className="page-shell">
      <h1>Reportes de compras</h1>
      <p>Totales por día o por semana. La semana de negocio va de domingo a sábado.</p>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <label style={{ gridColumn: 'span 3' }}>
            Sucursal
            <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Desde
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Hasta
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Agrupar por
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as 'day' | 'week')}>
              <option value="day">Día</option>
              <option value="week">Semana</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPreset('thisWeek')}>Esta semana</button>
          <button onClick={() => setPreset('lastWeek')}>Semana pasada</button>
          <button onClick={() => setPreset('last30')}>Últimos 30 días</button>
        </div>
      </section>

      {error ? <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p> : null}

      {report ? (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h3>Totales del período</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Total pagado</td>
                  <td>
                    <strong>{money(report.totals.totalLempiras)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Libras compradas</td>
                  <td>{number(report.totals.totalLibras)}</td>
                </tr>
                <tr>
                  <td>Quintales oro</td>
                  <td>{number(report.totals.totalQuintalesOro)}</td>
                </tr>
                <tr>
                  <td>Precio promedio por libra</td>
                  <td>L {report.totals.promedioPorLibra.toFixed(4)}</td>
                </tr>
                <tr>
                  <td>Número de compras</td>
                  <td>{report.totals.numeroCompras}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>{groupBy === 'week' ? 'Por semana' : 'Por día'}</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Libras</th>
                  <th>Qq oro</th>
                  <th>Total</th>
                  <th>Compras</th>
                </tr>
              </thead>
              <tbody>
                {report.periods.map((period) => (
                  <tr key={period.inicio} style={period.numeroCompras === 0 ? { color: 'var(--text-soft)' } : undefined}>
                    <td>{period.label}</td>
                    <td>{number(period.totalLibras)}</td>
                    <td>{number(period.totalQuintalesOro)}</td>
                    <td>{money(period.totalLempiras)}</td>
                    <td>{period.numeroCompras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Por producto</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Libras</th>
                  <th>Qq oro</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.porProducto.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{number(row.totalLibras)}</td>
                    <td>{number(row.totalQuintalesOro)}</td>
                    <td>{money(row.totalLempiras)}</td>
                  </tr>
                ))}
                {report.porProducto.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-soft)' }}>
                      Sin compras en el período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Por cliente</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Libras</th>
                  <th>Total</th>
                  <th>Compras</th>
                </tr>
              </thead>
              <tbody>
                {report.porCliente.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{number(row.totalLibras)}</td>
                    <td>{money(row.totalLempiras)}</td>
                    <td>{row.numeroCompras}</td>
                  </tr>
                ))}
                {report.porCliente.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-soft)' }}>
                      Sin compras en el período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
