'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { AttendanceDTO, EmployeeDTO } from '@/types/domain';
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

function daysAgoDateString(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type AttendanceForm = {
  horaEntrada: string;
  horaSalida: string;
  notas: string;
};

export default function PersonnelAttendancePanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [records, setRecords] = useState<AttendanceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formDate, setFormDate] = useState(todayDateString());
  const [formHoraEntrada, setFormHoraEntrada] = useState('');
  const [formHoraSalida, setFormHoraSalida] = useState('');
  const [formNotas, setFormNotas] = useState('');

  const [fromDate, setFromDate] = useState(daysAgoDateString(6));
  const [toDate, setToDate] = useState(todayDateString());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AttendanceForm>({ horaEntrada: '', horaSalida: '', notas: '' });

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`/api/employees?sucursalId=${sucursalId}`, { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeDTO[]>(res);
      setEmployees(data);
      setFormEmployeeId((current) => current || (data.length > 0 ? data[0].id : ''));
    } catch {
      // ignore errors fetching employees for the select
    }
  }, [sucursalId]);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (sucursalId) qs.set('sucursalId', sucursalId);
      if (fromDate) qs.set('from', fromDate);
      if (toDate) qs.set('to', toDate);
      const res = await fetch(`/api/employees/attendance?${qs.toString()}`, { cache: 'no-store' });
      const data = await parseApiResponse<AttendanceDTO[]>(res);
      setRecords(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando asistencia');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, sucursalId]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    void fetchAttendance();
  }, [fetchAttendance]);

  async function registrarAsistencia(event: React.FormEvent) {
    event.preventDefault();
    if (!formEmployeeId) {
      setError('Selecciona un empleado.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/employees/attendance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate: formDate,
          employeeId: formEmployeeId,
          ...(formHoraEntrada ? { horaEntrada: formHoraEntrada } : {}),
          ...(formHoraSalida ? { horaSalida: formHoraSalida } : {}),
          ...(formNotas ? { notas: formNotas } : {}),
        }),
      }).then(parseApiResponse);

      setFormHoraEntrada('');
      setFormHoraSalida('');
      setFormNotas('');
      await fetchAttendance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando asistencia');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(record: AttendanceDTO) {
    setEditingId(record.id);
    setEditForm({
      horaEntrada: record.horaEntrada ?? '',
      horaSalida: record.horaSalida ?? '',
      notas: record.notas ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ horaEntrada: '', horaSalida: '', notas: '' });
  }

  async function saveEdit(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/employees/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          horaEntrada: editForm.horaEntrada,
          horaSalida: editForm.horaSalida,
          notas: editForm.notas,
        }),
      }).then(parseApiResponse);
      cancelEdit();
      await fetchAttendance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando registro');
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecord(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/employees/attendance/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAttendance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando registro');
    } finally {
      setLoading(false);
    }
  }

  const activeEmployees = employees.filter((e) => e.activo);

  return (
    <section className="card-grid">
      <article className="card wide">
        <h3>Registrar entrada / salida</h3>
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
        <form onSubmit={(e) => void registrarAsistencia(e)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 8' }}>
            Empleado
            <select value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} required>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Fecha
            <input value={formDate} onChange={(e) => setFormDate(e.target.value)} type="date" required />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Hora entrada
            <input value={formHoraEntrada} onChange={(e) => setFormHoraEntrada(e.target.value)} type="time" />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Hora salida
            <input value={formHoraSalida} onChange={(e) => setFormHoraSalida(e.target.value)} type="time" />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Notas
            <input value={formNotas} onChange={(e) => setFormNotas(e.target.value)} placeholder="Opcional" />
          </label>
          <div style={{ gridColumn: 'span 12' }}>
            <button className="btn-primary" type="submit" disabled={loading || !formEmployeeId}>
              Guardar registro
            </button>
          </div>
        </form>
        <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 8 }}>
          Si ya existe un registro para ese empleado y fecha, se actualiza en lugar de duplicarse.
        </p>
      </article>

      <article className="card wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Historial</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Desde
              <input value={fromDate} onChange={(e) => setFromDate(e.target.value)} type="date" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Hasta
              <input value={toDate} onChange={(e) => setToDate(e.target.value)} type="date" />
            </label>
          </div>
        </div>

        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) =>
              editingId === record.id ? (
                <tr key={record.id}>
                  <td>{record.businessDate}</td>
                  <td>{record.employeeNombre}</td>
                  <td>
                    <input
                      value={editForm.horaEntrada}
                      onChange={(e) => setEditForm((f) => ({ ...f, horaEntrada: e.target.value }))}
                      type="time"
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.horaSalida}
                      onChange={(e) => setEditForm((f) => ({ ...f, horaSalida: e.target.value }))}
                      type="time"
                    />
                  </td>
                  <td>
                    <input value={editForm.notas} onChange={(e) => setEditForm((f) => ({ ...f, notas: e.target.value }))} />
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" type="button" onClick={() => void saveEdit(record.id)}>
                      Guardar
                    </button>
                    <button className="btn-danger" type="button" onClick={cancelEdit}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={record.id}>
                  <td>{record.businessDate}</td>
                  <td>{record.employeeNombre}</td>
                  <td>{record.horaEntrada ?? '—'}</td>
                  <td>{record.horaSalida ?? '—'}</td>
                  <td>{record.notas ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" type="button" onClick={() => startEdit(record)}>
                      Editar
                    </button>
                    <button className="btn-danger" type="button" onClick={() => void deleteRecord(record.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ),
            )}
            {records.length === 0 && !loading ? (
              <tr>
                <td colSpan={6}>No hay registros en el rango seleccionado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
