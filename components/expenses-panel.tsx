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

export default function ExpensesPanel() {
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expenseCategory, setExpenseCategory] = useState('Operativo');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

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

  async function createExpense(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, categoria: expenseCategory, descripcion: expenseDescription, monto: Number(expenseAmount) }),
      }).then(parseApiResponse);
      setExpenseDescription('');
      setExpenseAmount('');
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando gasto');
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando gasto');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <h1>Reportar gastos</h1>
      <p>Registrar gastos y ver el histórico del día seleccionado.</p>

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
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <form onSubmit={(e) => void createExpense(e)} className="row">
          <label style={{ gridColumn: 'span 12' }}>
            Categoria
            <input value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 12' }}>
            Descripcion
            <input value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 12' }}>
            Monto
            <input value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} type="number" step="0.01" required />
          </label>
          <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
            <button className="btn-primary" type="submit">
              Registrar gasto
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Gastos del día</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.expenses.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.categoria} - {item.descripcion}
                </td>
                <td>$ {item.monto.toFixed(2)}</td>
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
