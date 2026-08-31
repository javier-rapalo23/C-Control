'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { EmployeeAdvanceDTO, EmployeeDTO } from '@/types/domain';
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

export default function PersonnelAdvancesPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvanceDTO[]>([]);
  // Un estado por acción: compartir uno solo hacía que eliminar una fila pusiera
  // "Guardando..." en el botón del formulario —lejos de donde el usuario hizo
  // clic— mientras la fila borrada no daba ninguna señal.
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [advanceEmployeeId, setAdvanceEmployeeId] = useState('');
  const [advanceDate, setAdvanceDate] = useState(todayDateString());
  const [advanceMonto, setAdvanceMonto] = useState('');
  const [advanceMotivo, setAdvanceMotivo] = useState('');

  const fetchEmployees = useCallback(async () => {
    // Sin sucursal la API devuelve el personal de todas las sucursales, y elegir
    // por defecto el primero de esa lista dejaba seleccionado a un empleado que
    // ni siquiera aparece en el desplegable.
    if (!sucursalId) return;

    try {
      const res = await fetch(`/api/employees?sucursalId=${encodeURIComponent(sucursalId)}`, { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeDTO[]>(res);
      const activos = data.filter((employee) => employee.activo);
      setEmployees(data);
      // La selección debe existir dentro de las opciones visibles: si no existe,
      // el <select> muestra la primera opción pero el estado sigue apuntando al
      // empleado anterior, y el anticipo se guarda a nombre de ese otro.
      setAdvanceEmployeeId((current) =>
        activos.some((employee) => employee.id === current) ? current : (activos[0]?.id ?? ''),
      );
    } catch {
      // ignore errors fetching employees for the select
    }
  }, [sucursalId]);

  const fetchAdvances = useCallback(async () => {
    if (!sucursalId) return;

    try {
      setListLoading(true);
      const res = await fetch(`/api/employees/advances?sucursalId=${encodeURIComponent(sucursalId)}`, {
        cache: 'no-store',
      });
      const data = await parseApiResponse<EmployeeAdvanceDTO[]>(res);
      setAdvances(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando anticipos');
    } finally {
      setListLoading(false);
    }
  }, [sucursalId]);

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
      setSaving(true);
      setError(null);
      await fetch('/api/employees/advances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate: advanceDate,
          // Sin esto el gasto del anticipo caía siempre en la sucursal principal,
          // aunque el empleado y la caja fueran los de otra sucursal.
          sucursalId,
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
      setSaving(false);
    }
  }

  async function deleteAdvance(id: string) {
    try {
      setDeletingId(id);
      setError(null);
      await fetch(`/api/employees/advances/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAdvances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando anticipo');
    } finally {
      setDeletingId(null);
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
        <div className="row" style={{ marginBottom: 12 }}>
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
        </div>

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
            <button className="btn-primary" type="submit" disabled={saving || !advanceEmployeeId}>
              {saving ? 'Guardando...' : 'Registrar anticipo'}
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
        <h3>
          Historial de anticipos
          {listLoading ? (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-soft)' }}>
              Actualizando...
            </span>
          ) : null}
        </h3>
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
              <tr key={advance.id} style={{ opacity: deletingId === advance.id ? 0.5 : 1 }}>
                <td>{advance.businessDate}</td>
                <td>{advance.employeeNombre}</td>
                <td>{advance.motivo ?? '—'}</td>
                <td>L {advance.monto.toFixed(2)}</td>
                <td>
                  <button
                    className="btn-danger"
                    type="button"
                    onClick={() => void deleteAdvance(advance.id)}
                    disabled={deletingId !== null}
                  >
                    {deletingId === advance.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            ))}
            {advances.length === 0 && listLoading ? (
              <tr>
                <td colSpan={5}>Cargando anticipos...</td>
              </tr>
            ) : null}
            {advances.length === 0 && !listLoading ? (
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
