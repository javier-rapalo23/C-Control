'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CompanySettingsDTO, UserDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type Section = 'empresa' | 'usuarios' | 'roles';

type UserForm = { userId: string; nombre: string; password: string; role: string };
const emptyUserForm: UserForm = { userId: '', nombre: '', password: '', role: 'viewer' };

const ROLES = [
  { id: 'admin', label: 'Administrador', desc: 'Acceso total: configuración, usuarios, todos los módulos.' },
  { id: 'editor', label: 'Editor', desc: 'Puede registrar compras, ventas y gastos. No accede a mantenimiento.' },
  { id: 'viewer', label: 'Visualizador', desc: 'Solo lectura. No puede crear ni eliminar registros.' },
];

export default function MaintenancePanel() {
  const [section, setSection] = useState<Section>('empresa');

  // --- Company ---
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [companyForm, setCompanyForm] = useState({ nombre: '', rtn: '', telefono: '', direccion: '', email: '' });
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState(false);

  // --- Users ---
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const fetchCompany = useCallback(async () => {
    try {
      setCompanyLoading(true);
      const res = await fetch('/api/settings/company', { cache: 'no-store' });
      const data = await parseApiResponse<CompanySettingsDTO>(res);
      setCompany(data);
      setCompanyForm({ nombre: data.nombre, rtn: data.rtn, telefono: data.telefono, direccion: data.direccion, email: data.email });
      setCompanyError(null);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Error cargando empresa');
    } finally {
      setCompanyLoading(false);
    }
  }, []);

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
    void fetchCompany();
  }, [fetchCompany]);

  useEffect(() => {
    if (section === 'usuarios') void fetchUsers();
  }, [section, fetchUsers]);

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    try {
      setCompanyLoading(true);
      setCompanyError(null);
      setCompanySuccess(false);
      const res = await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(companyForm),
      });
      const data = await parseApiResponse<CompanySettingsDTO>(res);
      setCompany(data);
      setCompanySuccess(true);
      setTimeout(() => setCompanySuccess(false), 3000);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Error guardando empresa');
    } finally {
      setCompanyLoading(false);
    }
  }

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
    <main className="page-shell">
      <section className="hero">
        <h1>Mantenimiento</h1>
        <p>Configuración de la empresa, usuarios del sistema y roles.</p>
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['empresa', 'usuarios', 'roles'] as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={section === s ? 'btn-primary' : 'btn-secondary'}
          >
            {s === 'empresa' ? 'Empresa' : s === 'usuarios' ? 'Usuarios' : 'Roles'}
          </button>
        ))}
      </div>

      {/* ── EMPRESA ── */}
      {section === 'empresa' ? (
        <section className="card">
          <h3>Datos de la empresa</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 12 }}>
            Se usan en tickets, recibos y facturas.
          </p>
          {companyError ? <p style={{ color: 'var(--danger)' }}>{companyError}</p> : null}
          {companySuccess ? <p style={{ color: 'var(--ok, green)' }}>Guardado correctamente.</p> : null}
          <form onSubmit={(e) => void saveCompany(e)} className="row">
            <label style={{ gridColumn: 'span 12' }}>
              Nombre de la empresa
              <input value={companyForm.nombre} onChange={(e) => setCompanyForm((f) => ({ ...f, nombre: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              RTN
              <input value={companyForm.rtn} onChange={(e) => setCompanyForm((f) => ({ ...f, rtn: e.target.value }))} placeholder="1234-1234-123456" />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Teléfono
              <input value={companyForm.telefono} onChange={(e) => setCompanyForm((f) => ({ ...f, telefono: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 12' }}>
              Dirección
              <input value={companyForm.direccion} onChange={(e) => setCompanyForm((f) => ({ ...f, direccion: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 12' }}>
              Correo electrónico
              <input value={companyForm.email} onChange={(e) => setCompanyForm((f) => ({ ...f, email: e.target.value }))} type="email" />
            </label>
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={companyLoading}>
                {companyLoading ? 'Guardando...' : 'Guardar datos'}
              </button>
            </div>
          </form>
          {company ? (
            <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 12 }}>
              Última actualización: {new Date(company.updatedAt).toLocaleString('es-HN')}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── USUARIOS ── */}
      {section === 'usuarios' ? (
        <section className="card">
          <h3>Usuarios del sistema</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 12 }}>
            Los usuarios creados aquí se autentican desde la base de datos. Los usuarios de <code>RBAC_USERS_JSON</code> siguen funcionando como respaldo.
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
      ) : null}

      {/* ── ROLES ── */}
      {section === 'roles' ? (
        <section className="card">
          <h3>Roles del sistema</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 16 }}>
            Los roles definen qué puede hacer cada usuario en la aplicación.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROLES.map((role) => (
              <div
                key={role.id}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                  background: 'var(--surface-alt)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{role.label}</strong>
                  <code style={{ fontSize: 12, background: 'var(--border-color)', padding: '2px 8px', borderRadius: 4 }}>{role.id}</code>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-soft)' }}>{role.desc}</p>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Usuarios con este rol: </span>
                  {users.length > 0
                    ? users.filter((u) => u.role === role.id && u.activo).map((u) => (
                        <code key={u.id} style={{ fontSize: 12, marginLeft: 4 }}>{u.userId}</code>
                      ))
                    : <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
