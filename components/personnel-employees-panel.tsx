'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { EmployeeDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type EmployeeForm = {
  nombre: string;
  puesto: string;
  telefono: string;
  salarioDiario: string;
  fechaIngreso: string;
};

const emptyEmployeeForm: EmployeeForm = {
  nombre: '',
  puesto: '',
  telefono: '',
  salarioDiario: '',
  fechaIngreso: '',
};

export default function PersonnelEmployeesPanel() {
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployeesLoading(true);
      const res = await fetch('/api/employees', { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeDTO[]>(res);
      setEmployees(data);
      setEmployeesError(null);
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Error cargando empleados');
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  function startEditEmployee(employee: EmployeeDTO) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      nombre: employee.nombre,
      puesto: employee.puesto ?? '',
      telefono: employee.telefono ?? '',
      salarioDiario: employee.salarioDiario !== null ? String(employee.salarioDiario) : '',
      fechaIngreso: employee.fechaIngreso ?? '',
    });
  }

  function cancelEmployeeEdit() {
    setEditingEmployeeId(null);
    setEmployeeForm(emptyEmployeeForm);
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      nombre: employeeForm.nombre,
      ...(employeeForm.puesto ? { puesto: employeeForm.puesto } : {}),
      ...(employeeForm.telefono ? { telefono: employeeForm.telefono } : {}),
      ...(employeeForm.salarioDiario ? { salarioDiario: Number(employeeForm.salarioDiario) } : {}),
      ...(employeeForm.fechaIngreso ? { fechaIngreso: employeeForm.fechaIngreso } : {}),
    };
    try {
      setEmployeesLoading(true);
      if (editingEmployeeId) {
        await fetch(`/api/employees/${editingEmployeeId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(parseApiResponse);
      } else {
        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(parseApiResponse);
      }
      cancelEmployeeEdit();
      await fetchEmployees();
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Error guardando empleado');
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function toggleEmployeeActivo(employee: EmployeeDTO) {
    try {
      setEmployeesLoading(true);
      await fetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activo: !employee.activo }),
      }).then(parseApiResponse);
      await fetchEmployees();
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Error actualizando empleado');
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function deleteEmployee(id: string) {
    try {
      setEmployeesLoading(true);
      await fetch(`/api/employees/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchEmployees();
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : 'Error eliminando empleado');
    } finally {
      setEmployeesLoading(false);
    }
  }

  return (
    <section className="card-grid">
      <article className="card wide">
        <h3>Empleados</h3>
        {employeesError ? <p style={{ color: 'var(--danger)' }}>{employeesError}</p> : null}

        <table className="table-like">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Teléfono</th>
              <th>Salario</th>
              <th>Ingreso</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) =>
              editingEmployeeId === employee.id ? (
                <tr key={employee.id}>
                  <td>
                    <input
                      value={employeeForm.nombre}
                      onChange={(e) => setEmployeeForm((f) => ({ ...f, nombre: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      value={employeeForm.puesto}
                      onChange={(e) => setEmployeeForm((f) => ({ ...f, puesto: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      value={employeeForm.telefono}
                      onChange={(e) => setEmployeeForm((f) => ({ ...f, telefono: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      value={employeeForm.salarioDiario}
                      onChange={(e) => setEmployeeForm((f) => ({ ...f, salarioDiario: e.target.value }))}
                      type="number"
                      step="0.01"
                    />
                  </td>
                  <td>
                    <input
                      value={employeeForm.fechaIngreso}
                      onChange={(e) => setEmployeeForm((f) => ({ ...f, fechaIngreso: e.target.value }))}
                      type="date"
                    />
                  </td>
                  <td>{employee.activo ? 'Activo' : 'Inactivo'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" type="button" onClick={(e) => void saveEmployee(e)}>
                      Guardar
                    </button>
                    <button className="btn-danger" type="button" onClick={cancelEmployeeEdit}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={employee.id} style={{ opacity: employee.activo ? 1 : 0.5 }}>
                  <td>
                    <strong>{employee.nombre}</strong>
                  </td>
                  <td>{employee.puesto ?? '—'}</td>
                  <td>{employee.telefono ?? '—'}</td>
                  <td>{employee.salarioDiario !== null ? `L ${employee.salarioDiario.toFixed(2)}` : '—'}</td>
                  <td>{employee.fechaIngreso ?? '—'}</td>
                  <td>{employee.activo ? 'Activo' : 'Inactivo'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" type="button" onClick={() => startEditEmployee(employee)}>
                      Editar
                    </button>
                    <button className="btn-secondary" type="button" onClick={() => void toggleEmployeeActivo(employee)}>
                      {employee.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn-danger" type="button" onClick={() => void deleteEmployee(employee.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ),
            )}
            {employees.length === 0 && !employeesLoading ? (
              <tr>
                <td colSpan={7}>No hay empleados registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <h4 style={{ marginTop: 16 }}>{editingEmployeeId ? 'Editar empleado' : 'Nuevo empleado'}</h4>
        <form onSubmit={(e) => void saveEmployee(e)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 4' }}>
            Nombre *
            <input
              value={employeeForm.nombre}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, nombre: e.target.value }))}
              required
              disabled={!!editingEmployeeId}
            />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Puesto
            <input value={employeeForm.puesto} onChange={(e) => setEmployeeForm((f) => ({ ...f, puesto: e.target.value }))} />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Teléfono
            <input value={employeeForm.telefono} onChange={(e) => setEmployeeForm((f) => ({ ...f, telefono: e.target.value }))} />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Salario
            <input
              value={employeeForm.salarioDiario}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, salarioDiario: e.target.value }))}
              type="number"
              step="0.01"
            />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Fecha de ingreso
            <input
              value={employeeForm.fechaIngreso}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, fechaIngreso: e.target.value }))}
              type="date"
            />
          </label>
          <div style={{ gridColumn: 'span 4', alignSelf: 'end', display: 'flex', gap: 8 }}>
            <button className="btn-primary" type="submit" disabled={employeesLoading}>
              {editingEmployeeId ? 'Guardar cambios' : 'Agregar'}
            </button>
            {editingEmployeeId ? (
              <button className="btn-danger" type="button" onClick={cancelEmployeeEdit}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </article>
    </section>
  );
}
