'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { BancoDTO, LedgerDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';
import {
  DEFAULT_EXPENSE_CATEGORIA,
  MANUAL_EXPENSE_CATEGORIES,
  requiresBanco,
  type ExpenseCategoria,
} from '@/lib/expenses';

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
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategoria>(DEFAULT_EXPENSE_CATEGORIA);
  const [expenseBancoId, setExpenseBancoId] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [bancos, setBancos] = useState<BancoDTO[]>([]);

  const needsBanco = requiresBanco(expenseCategory);
  const bancosActivos = bancos.filter((banco) => banco.activo);

  const fetchLedger = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/ledger?businessDate=${businessDate}&sucursalId=${sucursalId}`, { cache: 'no-store' });
      const data = await parseApiResponse<LedgerDTO>(res);
      setLedger(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [businessDate, sucursalId]);

  useEffect(() => {
    void fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bancos', { cache: 'no-store' });
        setBancos(await parseApiResponse<BancoDTO[]>(res));
      } catch {
        // El catálogo vacío solo bloquea el pago a banco; el resto de gastos sigue.
        setBancos([]);
      }
    })();
  }, []);

  async function createExpense(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          categoria: expenseCategory,
          // El backend rechaza un banco en las demás categorías, así que solo va
          // cuando la categoría lo pide.
          bancoId: needsBanco ? expenseBancoId : undefined,
          descripcion: expenseDescription,
          monto: Number(expenseAmount),
        }),
      }).then(parseApiResponse);
      setExpenseDescription('');
      setExpenseAmount('');
      setExpenseBancoId('');
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

      <section className="card" style={{ marginTop: 12 }}>
        <form onSubmit={(e) => void createExpense(e)} className="row">
          <label style={{ gridColumn: needsBanco ? 'span 6' : 'span 12' }}>
            Categoría
            <select
              value={expenseCategory}
              onChange={(e) => {
                const categoria = e.target.value as ExpenseCategoria;
                setExpenseCategory(categoria);
                if (!requiresBanco(categoria)) setExpenseBancoId('');
              }}
              required
            >
              {MANUAL_EXPENSE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          {needsBanco ? (
            <label style={{ gridColumn: 'span 6' }}>
              Banco
              <select value={expenseBancoId} onChange={(e) => setExpenseBancoId(e.target.value)} required>
                <option value="">Seleccione un banco</option>
                {bancosActivos.map((banco) => (
                  <option key={banco.id} value={banco.id}>
                    {banco.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needsBanco && bancosActivos.length === 0 ? (
            <p style={{ gridColumn: 'span 12', color: 'var(--danger)', margin: 0 }}>
              No hay bancos activos. Agréguelos en Mantenimiento &gt; Bancos.
            </p>
          ) : null}
          <label style={{ gridColumn: 'span 12' }}>
            Descripcion
            <input value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 12' }}>
            Monto
            <input value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} type="number" step="0.01" required />
          </label>
          <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
            <button className="btn-primary" type="submit" disabled={needsBanco && !expenseBancoId}>
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
              <th>Categoría</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.expenses.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.categoria}
                  {item.bancoNombre ? ` (${item.bancoNombre})` : ''} - {item.descripcion}
                </td>
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
