'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ExpenseReportDTO, PurchaseReportDTO, SaleReportDTO } from '@/types/domain';
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
  const [tab, setTab] = useState<'purchases' | 'sales' | 'expenses'>('purchases');
  const [report, setReport] = useState<PurchaseReportDTO | null>(null);
  const [saleReport, setSaleReport] = useState<SaleReportDTO | null>(null);
  const [expenseReport, setExpenseReport] = useState<ExpenseReportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ambos reportes comparten filtros, así que se consulta solo el de la pestaña
  // visible; cambiar de pestaña con el mismo rango dispara la consulta que falta.
  const fetchReport = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ from, to, groupBy, sucursalId });
      // La pestaña coincide con el segmento de la ruta: purchases | sales | expenses.
      const data = await parseApiResponse<PurchaseReportDTO | SaleReportDTO | ExpenseReportDTO>(
        await fetch(`/api/reports/${tab}?${params}`, { cache: 'no-store' }),
      );
      if (tab === 'expenses') {
        setExpenseReport(data as ExpenseReportDTO);
      } else if (tab === 'sales') {
        setSaleReport(data as SaleReportDTO);
      } else {
        setReport(data as PurchaseReportDTO);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy, sucursalId, tab]);

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
      <h1>Reportes</h1>
      <p>Totales por día o por semana. La semana de negocio va de domingo a sábado.</p>

      <div className="page-tabs" style={{ marginTop: 12 }}>
        <button type="button" className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>
          Compras
        </button>
        <button type="button" className={tab === 'sales' ? 'active' : ''} onClick={() => setTab('sales')}>
          Ventas
        </button>
        <button type="button" className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}>
          Gastos
        </button>
      </div>

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

      {tab === 'purchases' && report ? (
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

      {tab === 'sales' && saleReport ? (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h3>Totales del período</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Total vendido</td>
                  <td>
                    <strong>{money(saleReport.totals.totalLempiras)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Libras vendidas</td>
                  <td>{number(saleReport.totals.totalLibras)}</td>
                </tr>
                <tr>
                  <td>Quintales oro</td>
                  <td>{number(saleReport.totals.totalQuintalesOro)}</td>
                </tr>
                <tr>
                  <td>Precio promedio por libra</td>
                  <td>L {saleReport.totals.promedioPorLibra.toFixed(4)}</td>
                </tr>
                {/* El café se vende por quintal oro: es el precio que interesa
                    comparar entre semanas, y solo aplica si hubo ventas en oro. */}
                {saleReport.totals.totalQuintalesOro > 0 ? (
                  <tr>
                    <td>Precio promedio por quintal oro</td>
                    <td>
                      <strong>L {saleReport.totals.promedioPorQuintalOro.toFixed(4)}</strong>
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td>Número de ventas</td>
                  <td>{saleReport.totals.numeroVentas}</td>
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
                  <th>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {saleReport.periods.map((period) => (
                  <tr key={period.inicio} style={period.numeroVentas === 0 ? { color: 'var(--text-soft)' } : undefined}>
                    <td>{period.label}</td>
                    <td>{number(period.totalLibras)}</td>
                    <td>{number(period.totalQuintalesOro)}</td>
                    <td>{money(period.totalLempiras)}</td>
                    <td>{period.numeroVentas}</td>
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
                {saleReport.porProducto.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{number(row.totalLibras)}</td>
                    <td>{number(row.totalQuintalesOro)}</td>
                    <td>{money(row.totalLempiras)}</td>
                  </tr>
                ))}
                {saleReport.porProducto.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-soft)' }}>
                      Sin ventas en el período.
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
                  <th>Qq oro</th>
                  <th>Total</th>
                  <th>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {saleReport.porCliente.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{number(row.totalQuintalesOro)}</td>
                    <td>{money(row.totalLempiras)}</td>
                    <td>{row.numeroVentas}</td>
                  </tr>
                ))}
                {saleReport.porCliente.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-soft)' }}>
                      Sin ventas en el período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === 'expenses' && expenseReport ? (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h3>Totales del período</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Total gastado</td>
                  <td>
                    <strong>{money(expenseReport.totals.total)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Número de gastos</td>
                  <td>{expenseReport.totals.numeroGastos}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Por categoría</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Total</th>
                  <th>%</th>
                  <th>Gastos</th>
                </tr>
              </thead>
              <tbody>
                {expenseReport.porCategoria.map((row) => (
                  <tr key={row.nombre}>
                    <td>{row.nombre}</td>
                    <td>{money(row.total)}</td>
                    <td>{row.porcentaje.toFixed(1)}%</td>
                    <td>{row.numeroGastos}</td>
                  </tr>
                ))}
                {expenseReport.porCategoria.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-soft)' }}>
                      Sin gastos en el período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {expenseReport.porBanco.length > 0 ? (
            <section className="card" style={{ marginTop: 12 }}>
              <h3>Pagos por banco</h3>
              <table className="table-like" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Banco</th>
                    <th>Total</th>
                    <th>Pagos</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseReport.porBanco.map((row) => (
                    <tr key={row.nombre}>
                      <td>{row.nombre}</td>
                      <td>{money(row.total)}</td>
                      <td>{row.numeroGastos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="card" style={{ marginTop: 12 }}>
            <h3>{groupBy === 'week' ? 'Por semana' : 'Por día'}</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Total</th>
                  <th>Gastos</th>
                </tr>
              </thead>
              <tbody>
                {expenseReport.periods.map((period) => (
                  <tr key={period.inicio} style={period.numeroGastos === 0 ? { color: 'var(--text-soft)' } : undefined}>
                    <td>{period.label}</td>
                    <td>{money(period.total)}</td>
                    <td>{period.numeroGastos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
