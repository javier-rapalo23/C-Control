'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ModuleAccessDTO, UserDTO } from '@/types/domain';
import { ROLE_KEYS } from '@/lib/modules';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const ROLE_LABELS: Record<string, string> = {
  editor: 'Editor',
  viewer: 'Visualizador',
  comprador: 'Comprador',
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

export default function MaintenanceRolesPanel() {
  const [users, setUsers] = useState<UserDTO[]>([]);

  const [modules, setModules] = useState<ModuleAccessDTO[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [modulesSuccess, setModulesSuccess] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/users', { cache: 'no-store' });
      const data = await parseApiResponse<UserDTO[]>(res);
      setUsers(data);
    } catch {
      // this list is only used for the informational count below, ignore errors
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

  useEffect(() => {
    void fetchUsers();
    void fetchModules();
  }, [fetchUsers, fetchModules]);

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

  return (
    <>
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

      <section className="card" style={{ marginTop: 16 }}>
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
    </>
  );
}
