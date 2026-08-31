'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { UserDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type UserForm = { userId: string; nombre: string; password: string; role: string };
const emptyUserForm: UserForm = { userId: '', nombre: '', password: '', role: 'viewer' };

const ROLES = [
  { id: 'admin', label: 'Administrador' },
  { id: 'editor', label: 'Editor' },
  { id: 'viewer', label: 'Visualizador' },
  { id: 'comprador', label: 'Comprador' },
];

export default function MaintenanceUsersPanel() {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const res = await fetch('/api/settings/users', { cache: 'no-store' });
      const data = await parseApiResponse<UserDTO[]>(res);
      setUsers(data);
      setUsersError(null);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Error cargando usuarios');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  function startEditUser(user: UserDTO) {
    setEditingUserId(user.id);
    setUserForm({ userId: user.userId, nombre: user.nombre, password: '', role: user.role });
    setShowPassword(false);
  }

  function cancelUserEdit() {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      setUsersLoading(true);
      setUsersError(null);
      if (editingUserId) {
        const payload: Record<string, unknown> = { nombre: userForm.nombre, role: userForm.role };
        if (userForm.password) payload.password = userForm.password;
        await fetch(`/api/settings/users/${editingUserId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(parseApiResponse);
      } else {
        await fetch('/api/settings/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(userForm),
        }).then(parseApiResponse);
      }
      cancelUserEdit();
      await fetchUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Error guardando usuario');
    } finally {
      setUsersLoading(false);
    }
  }

  async function toggleUserActivo(user: UserDTO) {
    try {
      setUsersLoading(true);
      await fetch(`/api/settings/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activo: !user.activo }),
      }).then(parseApiResponse);
      await fetchUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Error actualizando usuario');
    } finally {
      setUsersLoading(false);
    }
  }

  async function deleteUser(id: string) {
    try {
      setUsersLoading(true);
      await fetch(`/api/settings/users/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Error eliminando usuario');
    } finally {
      setUsersLoading(false);
    }
  }

  return (
    <section className="card">
      <h3>Usuarios del sistema</h3>
      <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 12 }}>
        Los usuarios creados aquí se autentican desde la base de datos. Los de <code>RBAC_USERS_JSON</code> funcionan como respaldo solo si no existen aquí; desactivar un usuario de esta lista le quita el acceso aunque figure en esa variable.
      </p>
      {usersError ? <p style={{ color: 'var(--danger)' }}>{usersError}</p> : null}

      <table className="table-like" style={{ marginBottom: 20 }}>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && !usersLoading ? (
            <tr><td colSpan={5}>No hay usuarios en la base de datos.</td></tr>
          ) : null}
          {users.map((u) => (
            <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.5 }}>
              <td><strong>{u.userId}</strong></td>
              <td>{u.nombre || '—'}</td>
              <td>{u.role}</td>
              <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
              <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn-primary" type="button" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => startEditUser(u)}>
                  Editar
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => void toggleUserActivo(u)}
                >
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button className="btn-danger" type="button" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => void deleteUser(u.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>{editingUserId ? 'Editar usuario' : 'Nuevo usuario'}</h4>
      <form onSubmit={(e) => void saveUser(e)} className="row" style={{ marginTop: 10 }}>
        <label style={{ gridColumn: 'span 6' }}>
          ID de usuario *
          <input
            value={userForm.userId}
            onChange={(e) => setUserForm((f) => ({ ...f, userId: e.target.value }))}
            disabled={!!editingUserId}
            required={!editingUserId}
            placeholder="ej: operador2"
          />
        </label>
        <label style={{ gridColumn: 'span 6' }}>
          Nombre completo
          <input value={userForm.nombre} onChange={(e) => setUserForm((f) => ({ ...f, nombre: e.target.value }))} />
        </label>
        <label style={{ gridColumn: 'span 6' }}>
          {editingUserId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
          <div style={{ position: 'relative' }}>
            <input
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
              type={showPassword ? 'text' : 'password'}
              required={!editingUserId}
              style={{ paddingRight: 72 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)' }}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>
        <label style={{ gridColumn: 'span 6' }}>
          Rol *
          <select value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        <div style={{ gridColumn: 'span 12', display: 'flex', gap: 8 }}>
          <button className="btn-primary" type="submit" disabled={usersLoading}>
            {editingUserId ? 'Guardar cambios' : 'Crear usuario'}
          </button>
          {editingUserId ? (
            <button className="btn-danger" type="button" onClick={cancelUserEdit}>Cancelar</button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
