'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { EmployeeAdvanceDTO, EmployeeDTO } from '@/types/domain';

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

export default function PersonnelAdvancesPanel() {
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvanceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [advanceEmployeeId, setAdvanceEmployeeId] = useState('');
  const [advanceDate, setAdvanceDate] = useState(todayDateString());
  const [advanceMonto, setAdvanceMonto] = useState('');
  const [advanceMotivo, setAdvanceMotivo] = useState('');

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees', { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeDTO[]>(res);
      setEmployees(data);
      setAdvanceEmployeeId((current) => current || (data.length > 0 ? data[0].id : ''));
    } catch {
      // ignore errors fetching employees for the select
    }
  }, []);

  const fetchAdvances = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/employees/advances', { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeAdvanceDTO[]>(res);
      setAdvances(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando anticipos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEmployees();
    void fetchAdvances();
  }, [fetchEmployees, fetchAdvances]);

  async function registrarAnticipo(event: React.FormEvent) {
    event.preventDefault();
    if (!advanceEmployeeId) {
      setError('Selecciona un empleado.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/employees/advances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate: advanceDate,
          employeeId: advanceEmployeeId,
          monto: Number(advanceMonto),
          ...(advanceMotivo ? { motivo: advanceMotivo } : {}),
        }),
      }).then(parseApiResponse);

      setAdvanceMonto('');
      setAdvanceMotivo('');
      await fetchAdvances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando anticipo');
    } finally {
      setLoading(false);
    }
  }

  async function deleteAdvance(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/employees/advances/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAdvances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando anticipo');
    } finally {
      setLoading(false);
    }
  }

  const activeEmployees = employees.filter((e) => e.activo);
  const totalPorEmpleado = advances.reduce<Record<string, number>>((acc, advance) => {
    acc[advance.employeeNombre] = (acc[advance.employeeNombre] ?? 0) + advance.monto;
    return acc;
  }, {});

  return (
    <section className="card-grid">
      <article className="card wide">
        <h3>Registrar anticipo</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <form onSubmit={(e) => void registrarAnticipo(e)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 8' }}>
            Empleado
            <select value={advanceEmployeeId} onChange={(e) => setAdvanceEmployeeId(e.target.value)} required>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Fecha
            <input value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} type="date" required />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input value={advanceMonto} onChange={(e) => setAdvanceMonto(e.target.value)} type="number" step="0.01" required />
          </label>
          <label style={{ gridColumn: 'span 8' }}>
            Motivo
            <input value={advanceMotivo} onChange={(e) => setAdvanceMotivo(e.target.value)} placeholder="Opcional" />
          </label>
          <div style={{ gridColumn: 'span 12' }}>
            <button className="btn-primary" type="submit" disabled={loading || !advanceEmployeeId}>
              {loading ? 'Guardando...' : 'Registrar anticipo'}
            </button>
          </div>
        </form>
      </article>

      {Object.keys(totalPorEmpleado).length > 0 ? (
        <article className="card wide">
          <h3>Total anticipado por empleado</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {Object.entries(totalPorEmpleado).map(([nombre, total]) => (
              <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{nombre}</span>
                <strong>L {total.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <article className="card wide">
        <h3>Historial de anticipos</h3>
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Motivo</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {advances.map((advance) => (
              <tr key={advance.id}>
                <td>{advance.businessDate}</td>
                <td>{advance.employeeNombre}</td>
                <td>{advance.motivo ?? '—'}</td>
                <td>L {advance.monto.toFixed(2)}</td>
                <td>
                  <button className="btn-danger" type="button" onClick={() => void deleteAdvance(advance.id)} disabled={loading}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {advances.length === 0 && !loading ? (
              <tr>
                <td colSpan={5}>No hay anticipos registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
