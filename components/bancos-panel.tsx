'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { BancoDTO } from '@/types/domain';
import MaintenanceTabs from '@/components/maintenance-tabs';
import { BANK_EXPENSE_CATEGORY } from '@/lib/expenses';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

export default function BancosPanel() {
  const [bancos, setBancos] = useState<BancoDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id: string; nombre: string; activo: boolean } | null>(null);
  const [newNombre, setNewNombre] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bancos', { cache: 'no-store' });
      setBancos(await parseApiResponse<BancoDTO[]>(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando bancos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function createBanco(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/bancos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: newNombre }),
      }).then(parseApiResponse);
      setNewNombre('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando banco');
      setLoading(false);
    }
  }

  async function updateBanco(id: string) {
    if (!editing) return;
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/bancos/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: editing.nombre, activo: editing.activo }),
      }).then(parseApiResponse);
      setEditing(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando banco');
      setLoading(false);
    }
  }

  async function deleteBanco(id: string) {
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/bancos/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando banco');
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Bancos</h1>
        <p>
          Bancos a los que la empresa hace pagos. Cada gasto de &quot;{BANK_EXPENSE_CATEGORY}&quot; se registra contra uno
          de ellos, y de ahí sale el desglose por banco del reporte de gastos.
        </p>
      </section>

      <MaintenanceTabs />

      <section className="card-grid">
        {error ? (
          <article className="card wide">
            <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          </article>
        ) : null}

        <article className="card wide">
          <h3>Bancos registrados</h3>

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map((banco) =>
                editing?.id === banco.id ? (
                  <tr key={banco.id}>
                    <td>
                      <input
                        value={editing.nombre}
                        onChange={(e) => setEditing((prev) => prev && { ...prev, nombre: e.target.value })}
                      />
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={editing.activo}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, activo: e.target.checked })}
                        />
                        Activo
                      </label>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-primary" type="button" onClick={() => void updateBanco(banco.id)}>
                        Guardar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={banco.id}>
                    <td>{banco.nombre}</td>
                    <td>{banco.activo ? 'Activo' : 'Inactivo'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => setEditing({ id: banco.id, nombre: banco.nombre, activo: banco.activo })}
                      >
                        Editar
                      </button>
                      {/* Un banco con pagos ya registrados no se puede borrar: el API responde
                          409 y el mensaje sugiere desactivarlo. */}
                      <button className="btn-danger" type="button" onClick={() => void deleteBanco(banco.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {bancos.length === 0 && !loading ? (
                <tr>
                  <td colSpan={3}>No hay bancos registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Nuevo banco</h4>
          <form onSubmit={(e) => void createBanco(e)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 10' }}>
              Nombre
              <input value={newNombre} onChange={(e) => setNewNombre(e.target.value)} required />
            </label>
            <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
              <button className="btn-primary" type="submit" disabled={loading}>
                Agregar
              </button>
            </div>
          </form>
        </article>
      </section>
    </main>
  );
}
