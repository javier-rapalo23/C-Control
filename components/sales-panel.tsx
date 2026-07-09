'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { LedgerDTO } from '@/types/domain';

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

export default function SalesPanel() {
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saleDescription, setSaleDescription] = useState('');
  const [saleAmount, setSaleAmount] = useState('');

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ledger?businessDate=${businessDate}`, { cache: 'no-store' });
      const data = await parseApiResponse<LedgerDTO>(res);
      setLedger(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  useEffect(() => {
    void fetchLedger();
  }, [fetchLedger]);

  async function createSale(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, descripcion: saleDescription, monto: Number(saleAmount) }),
      }).then(parseApiResponse);
      setSaleDescription('');
      setSaleAmount('');
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando venta');
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/sales/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando venta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <h1>Ventas</h1>
      <p>Registrar ventas y ver ventas del día seleccionado.</p>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <label style={{ gridColumn: 'span 4' }}>
            Fecha de negocio
            <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
          </label>
          <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
            <button className="btn-primary" type="button" onClick={() => void fetchLedger()}>
              Recargar
            </button>
          </div>
          <div style={{ gridColumn: 'span 6', alignSelf: 'end', textAlign: 'right' }}>
            <a href={`/api/export?businessDate=${businessDate}`} target="_blank" rel="noreferrer">
              <button className="btn-primary" type="button">
                Exportar JSON
              </button>
            </a>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <form onSubmit={(e) => void createSale(e)} className="row">
          <label style={{ gridColumn: 'span 8' }}>
            Descripción
            <input value={saleDescription} onChange={(e) => setSaleDescription(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} type="number" step="0.01" required />
          </label>
          <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
            <button className="btn-primary" type="submit">
              Registrar venta
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Ventas del día</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.sales.map((item) => (
              <tr key={item.id}>
                <td>{item.descripcion}</td>
                <td>L {item.monto.toFixed(2)}</td>
                <td>
                  <button className="btn-danger" onClick={() => void removeEntry(item.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
