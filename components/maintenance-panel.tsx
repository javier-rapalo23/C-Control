'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, CompanySettingsDTO, ModuleAccessDTO, UserDTO } from '@/types/domain';
import { useModuleGuard } from '@/lib/use-module-guard';
import { ROLE_KEYS } from '@/lib/modules';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type Section = 'empresa' | 'usuarios' | 'roles' | 'permisos' | 'clientes';

const ROLE_LABELS: Record<string, string> = {
  editor: 'Editor',
  viewer: 'Visualizador',
  comprador: 'Comprador',
};

type UserForm = { userId: string; nombre: string; password: string; role: string };
const emptyUserForm: UserForm = { userId: '', nombre: '', password: '', role: 'viewer' };

type ClientForm = {
  nombre: string;
  telefono: string;
  direccion: string;
  rtn: string;
  cuentaBancaria: string;
  notas: string;
};

const emptyClientForm: ClientForm = {
  nombre: '',
  telefono: '',
  direccion: '',
  rtn: '',
  cuentaBancaria: '',
  notas: '',
};

const ROLES = [
  { id: 'admin', label: 'Administrador', desc: 'Acceso total: configuración, usuarios, todos los módulos.' },
  { id: 'editor', label: 'Editor', desc: 'Puede registrar compras, ventas y gastos. No accede a mantenimiento.' },
  { id: 'viewer', label: 'Visualizador', desc: 'Solo lectura. No puede crear ni eliminar registros.' },
  {
    id: 'comprador',
    label: 'Comprador',
    desc: 'Solo puede registrar compras, ventas y gastos. Sin acceso al dashboard ni a mantenimiento.',
  },
];

export default function MaintenancePanel() {
  const roleGuardStatus = useModuleGuard('maintenance');
  const [section, setSection] = useState<Section>('empresa');

  // --- Company ---
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [companyForm, setCompanyForm] = useState({
    nombre: '',
    rtn: '',
    telefono: '',
    direccion: '',
    email: '',
    printerIp: '',
    printerPort: '9100',
  });
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

  // --- Module access ---
  const [modules, setModules] = useState<ModuleAccessDTO[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [modulesSuccess, setModulesSuccess] = useState(false);

  // --- Clients ---
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);

  const fetchCompany = useCallback(async () => {
    try {
      setCompanyLoading(true);
      const res = await fetch('/api/settings/company', { cache: 'no-store' });
      const data = await parseApiResponse<CompanySettingsDTO>(res);
      setCompany(data);
      setCompanyForm({
        nombre: data.nombre,
        rtn: data.rtn,
        telefono: data.telefono,
        direccion: data.direccion,
        email: data.email,
        printerIp: data.printerIp,
        printerPort: String(data.printerPort || 9100),
      });
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

  const fetchModules = useCallback(async () => {
    try {
      setModulesLoading(true);
      const res = await fetch('/api/settings/module-access', { cache: 'no-store' });
      const data = await parseApiResponse<ModuleAccessDTO[]>(res);
      setModules(data);
      setModulesError(null);
    } catch (err) {
      setModulesError(err instanceof Error ? err.message : 'Error cargando permisos');
    } finally {
      setModulesLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setClientsLoading(true);
      const res = await fetch('/api/clients', { cache: 'no-store' });
      const data = await parseApiResponse<ClientDTO[]>(res);
      setClients(data);
      setClientsError(null);
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Error cargando clientes');
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompany();
  }, [fetchCompany]);

  useEffect(() => {
    if (section === 'usuarios') void fetchUsers();
  }, [section, fetchUsers]);

  useEffect(() => {
    if (section === 'permisos') void fetchModules();
  }, [section, fetchModules]);

  useEffect(() => {
    if (section === 'clientes') void fetchClients();
  }, [section, fetchClients]);

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    try {
      setCompanyLoading(true);
      setCompanyError(null);
      setCompanySuccess(false);
      const res = await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...companyForm,
          printerPort: companyForm.printerPort ? Number(companyForm.printerPort) : undefined,
        }),
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

  // --- Module access ---

  function toggleModuleRole(moduleKey: string, role: string) {
    setModules((current) =>
      current.map((m) =>
        m.moduleKey === moduleKey
          ? { ...m, roles: m.roles.includes(role) ? m.roles.filter((r) => r !== role) : [...m.roles, role] }
          : m,
      ),
    );
  }

  async function saveModules() {
    try {
      setModulesLoading(true);
      setModulesError(null);
      setModulesSuccess(false);
      const payload = {
        modules: modules.filter((m) => !m.locked).map((m) => ({ moduleKey: m.moduleKey, roles: m.roles })),
      };
      const res = await fetch('/api/settings/module-access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse<ModuleAccessDTO[]>(res);
      setModules(data);
      setModulesSuccess(true);
      setTimeout(() => setModulesSuccess(false), 3000);
    } catch (err) {
      setModulesError(err instanceof Error ? err.message : 'Error guardando permisos');
    } finally {
      setModulesLoading(false);
    }
  }

  // --- Clients CRUD ---

  function startEditClient(client: ClientDTO) {
    setEditingClientId(client.id);
    setClientForm({
      nombre: client.nombre,
      telefono: client.telefono ?? '',
      direccion: client.direccion ?? '',
      rtn: client.rtn ?? '',
      cuentaBancaria: client.cuentaBancaria ?? '',
      notas: client.notas ?? '',
    });
  }

  function cancelClientEdit() {
    setEditingClientId(null);
    setClientForm(emptyClientForm);
  }

  async function saveClient(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      nombre: clientForm.nombre,
      ...(clientForm.telefono ? { telefono: clientForm.telefono } : {}),
      ...(clientForm.direccion ? { direccion: clientForm.direccion } : {}),
      ...(clientForm.rtn ? { rtn: clientForm.rtn } : {}),
      ...(clientForm.cuentaBancaria ? { cuentaBancaria: clientForm.cuentaBancaria } : {}),
      ...(clientForm.notas ? { notas: clientForm.notas } : {}),
    };
    try {
      setClientsLoading(true);
      if (editingClientId) {
        await fetch(`/api/clients/${editingClientId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(parseApiResponse);
      } else {
        await fetch('/api/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(parseApiResponse);
      }
      cancelClientEdit();
      await fetchClients();
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Error guardando cliente');
    } finally {
      setClientsLoading(false);
    }
  }

  async function deleteClient(id: string) {
    try {
      setClientsLoading(true);
      await fetch(`/api/clients/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchClients();
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Error eliminando cliente');
    } finally {
      setClientsLoading(false);
    }
  }

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Mantenimiento</h1>
        <p>Configuración de la empresa, usuarios del sistema y roles.</p>
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['empresa', 'usuarios', 'roles', 'permisos', 'clientes'] as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={section === s ? 'btn-primary' : 'btn-secondary'}
          >
            {s === 'empresa'
              ? 'Empresa'
              : s === 'usuarios'
                ? 'Usuarios'
                : s === 'roles'
                  ? 'Roles'
                  : s === 'permisos'
                    ? 'Permisos'
                    : 'Clientes'}
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

            <div style={{ gridColumn: 'span 12', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 4px' }}>Impresora térmica</h4>
              <p style={{ color: 'var(--text-soft)', fontSize: 13, margin: '0 0 12px' }}>
                Los tickets se envían directamente a esta impresora de red (sin vista previa).
              </p>
            </div>
            <label style={{ gridColumn: 'span 8' }}>
              IP de la impresora
              <input
                value={companyForm.printerIp}
                onChange={(e) => setCompanyForm((f) => ({ ...f, printerIp: e.target.value }))}
                placeholder="192.168.101.98"
              />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              Puerto
              <input
                value={companyForm.printerPort}
                onChange={(e) => setCompanyForm((f) => ({ ...f, printerPort: e.target.value }))}
                type="number"
                placeholder="9100"
              />
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

      {/* ── PERMISOS ── */}
      {section === 'permisos' ? (
        <section className="card">
          <h3>Permisos por módulo</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 12 }}>
            Elige qué roles pueden acceder a cada módulo. El rol <strong>admin</strong> siempre tiene acceso total y
            Mantenimiento siempre es exclusivo de admin, para evitar quedar bloqueado del sistema.
          </p>
          {modulesError ? <p style={{ color: 'var(--danger)' }}>{modulesError}</p> : null}
          {modulesSuccess ? <p style={{ color: 'var(--ok, green)' }}>Guardado correctamente.</p> : null}

          <table className="table-like">
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Admin</th>
                {ROLE_KEYS.map((role) => (
                  <th key={role}>{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.moduleKey}>
                  <td>
                    <strong>{m.label}</strong>
                    {m.locked ? <span style={{ color: 'var(--text-soft)', fontSize: 12 }}> (fijo)</span> : null}
                  </td>
                  <td>
                    <input type="checkbox" checked disabled />
                  </td>
                  {ROLE_KEYS.map((role) => (
                    <td key={role}>
                      <input
                        type="checkbox"
                        checked={m.roles.includes(role)}
                        disabled={m.locked}
                        onChange={() => toggleModuleRole(m.moduleKey, role)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {modules.length === 0 && !modulesLoading ? (
                <tr>
                  <td colSpan={2 + ROLE_KEYS.length}>Cargando módulos...</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div style={{ marginTop: 16 }}>
            <button className="btn-primary" type="button" onClick={() => void saveModules()} disabled={modulesLoading}>
              {modulesLoading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── CLIENTES ── */}
      {section === 'clientes' ? (
        <section className="card">
          <h3>Clientes</h3>
          {clientsError ? <p style={{ color: 'var(--danger)' }}>{clientsError}</p> : null}

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.nombre}
                    {c.esGeneral ? <span style={{ color: 'var(--text-soft)', fontSize: 12 }}> (general)</span> : null}
                  </td>
                  <td>{c.telefono ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" type="button" onClick={() => startEditClient(c)}>
                      Editar
                    </button>
                    {!c.esGeneral ? (
                      <button className="btn-danger" type="button" onClick={() => void deleteClient(c.id)}>
                        Eliminar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && !clientsLoading ? (
                <tr>
                  <td colSpan={3}>No hay clientes registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>{editingClientId ? 'Editar cliente' : 'Nuevo cliente'}</h4>
          <form onSubmit={(e) => void saveClient(e)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 6' }}>
              Nombre *
              <input value={clientForm.nombre} onChange={(e) => setClientForm((f) => ({ ...f, nombre: e.target.value }))} required />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Teléfono
              <input value={clientForm.telefono} onChange={(e) => setClientForm((f) => ({ ...f, telefono: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Dirección
              <input value={clientForm.direccion} onChange={(e) => setClientForm((f) => ({ ...f, direccion: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              RTN
              <input value={clientForm.rtn} onChange={(e) => setClientForm((f) => ({ ...f, rtn: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Cuenta bancaria
              <input value={clientForm.cuentaBancaria} onChange={(e) => setClientForm((f) => ({ ...f, cuentaBancaria: e.target.value }))} />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Notas
              <input value={clientForm.notas} onChange={(e) => setClientForm((f) => ({ ...f, notas: e.target.value }))} />
            </label>
            <div style={{ gridColumn: 'span 12', display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn-primary" type="submit" disabled={clientsLoading}>
                {editingClientId ? 'Guardar cambios' : 'Crear cliente'}
              </button>
              {editingClientId ? (
                <button className="btn-danger" type="button" onClick={cancelClientEdit}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
