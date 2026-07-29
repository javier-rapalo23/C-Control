'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { SucursalDTO } from '@/types/domain';
import { useModuleGuard } from '@/lib/use-module-guard';
import MaintenanceTabs from '@/components/maintenance-tabs';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

export default function SucursalesPanel() {
  const roleGuardStatus = useModuleGuard('sucursales');
  const [sucursales, setSucursales] = useState<SucursalDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id: string; nombre: string; direccion: string; activo: boolean } | null>(null);
  const [newNombre, setNewNombre] = useState('');
  const [newDireccion, setNewDireccion] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sucursales', { cache: 'no-store' });
      const data = await parseApiResponse<SucursalDTO[]>(response);
      setSucursales(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando sucursales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function createSucursal(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/sucursales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: newNombre, direccion: newDireccion || undefined }),
      }).then(parseApiResponse);
      setNewNombre('');
      setNewDireccion('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando sucursal');
      setLoading(false);
    }
  }

  async function updateSucursal(id: string) {
    if (!editing) return;
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/sucursales/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: editing.nombre, direccion: editing.direccion || undefined, activo: editing.activo }),
      }).then(parseApiResponse);
      setEditing(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando sucursal');
      setLoading(false);
    }
  }

  async function deleteSucursal(id: string) {
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/sucursales/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando sucursal');
      setLoading(false);
    }
  }

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Sucursales</h1>
        <p>Administra las sucursales de la empresa. Cada compra, venta, gasto e inventario queda ligado a una sucursal.</p>
      </section>

      <MaintenanceTabs />

      <section className="card-grid">
        {error ? (
          <article className="card wide">
            <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          </article>
        ) : null}

        <article className="card wide">
          <h3>Sucursales registradas</h3>

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sucursales.map((s) =>
                editing?.id === s.id ? (
                  <tr key={s.id}>
                    <td>
                      <input value={editing.nombre} onChange={(e) => setEditing((prev) => prev && { ...prev, nombre: e.target.value })} />
                    </td>
                    <td>
                      <input
                        value={editing.direccion}
                        onChange={(e) => setEditing((prev) => prev && { ...prev, direccion: e.target.value })}
                      />
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={editing.activo}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, activo: e.target.checked })}
                        />
                        Activa
                      </label>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-primary" type="button" onClick={() => void updateSucursal(s.id)}>
                        Guardar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>
                      {s.nombre} {s.esPrincipal ? <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>(principal)</span> : null}
                    </td>
                    <td>{s.direccion ?? '—'}</td>
                    <td>{s.activo ? 'Activa' : 'Inactiva'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => setEditing({ id: s.id, nombre: s.nombre, direccion: s.direccion ?? '', activo: s.activo })}
                      >
                        Editar
                      </button>
                      {!s.esPrincipal ? (
                        <button className="btn-danger" type="button" onClick={() => void deleteSucursal(s.id)}>
                          Eliminar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}
              {sucursales.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4}>No hay sucursales registradas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Nueva sucursal</h4>
          <form onSubmit={(e) => void createSucursal(e)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 5' }}>
              Nombre
              <input value={newNombre} onChange={(e) => setNewNombre(e.target.value)} required />
            </label>
            <label style={{ gridColumn: 'span 5' }}>
              Dirección
              <input value={newDireccion} onChange={(e) => setNewDireccion(e.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
              <button className="btn-primary" type="submit" disabled={loading}>
                Agregar
              </button>
            </div>
          </form>
        </article>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
