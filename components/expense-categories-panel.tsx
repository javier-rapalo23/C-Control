'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ExpenseCategoryDTO } from '@/types/domain';
import MaintenanceTabs from '@/components/maintenance-tabs';
import ErrorToast from '@/components/error-toast';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type EditingCategory = { id: string; nombre: string; requiereBanco: boolean; activo: boolean };

export default function ExpenseCategoriesPanel() {
  const [categories, setCategories] = useState<ExpenseCategoryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingCategory | null>(null);
  const [newNombre, setNewNombre] = useState('');
  const [newRequiereBanco, setNewRequiereBanco] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/expense-categories', { cache: 'no-store' });
      setCategories(await parseApiResponse<ExpenseCategoryDTO[]>(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando categorías');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/expense-categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: newNombre, requiereBanco: newRequiereBanco }),
      }).then(parseApiResponse);
      setNewNombre('');
      setNewRequiereBanco(false);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando categoría');
      setLoading(false);
    }
  }

  async function updateCategory(id: string) {
    if (!editing) return;
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/expense-categories/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: editing.nombre,
          requiereBanco: editing.requiereBanco,
          activo: editing.activo,
        }),
      }).then(parseApiResponse);
      setEditing(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando categoría');
      setLoading(false);
    }
  }

  async function deleteCategory(id: string) {
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/expense-categories/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando categoría');
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Categorías de gasto</h1>
        <p>
          Categorías que se eligen al reportar un gasto y por las que se agrupa el reporte de gastos. Las que llevan
          banco exigen indicarlo y entran en el desglose por banco.
        </p>
      </section>

      <MaintenanceTabs />

      <section className="card-grid">
        <ErrorToast message={error} onClose={() => setError(null)} />

        <article className="card wide">
          <h3>Categorías registradas</h3>

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Lleva banco</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) =>
                editing?.id === category.id ? (
                  <tr key={category.id}>
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
                          checked={editing.requiereBanco}
                          onChange={(e) => setEditing((prev) => prev && { ...prev, requiereBanco: e.target.checked })}
                        />
                        Lleva banco
                      </label>
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
                      <button className="btn-primary" type="button" onClick={() => void updateCategory(category.id)}>
                        Guardar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={category.id}>
                    <td>
                      {category.nombre}
                      {category.sistema ? ' (automática)' : ''}
                    </td>
                    <td>{category.requiereBanco ? 'Sí' : 'No'}</td>
                    <td>{category.activo ? 'Activa' : 'Inactiva'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {/* Las de sistema las escribe el código por nombre: el API rechaza
                          editarlas o borrarlas, así que ni se ofrece. */}
                      {category.sistema ? (
                        <span>Administrada por el sistema</span>
                      ) : (
                        <>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() =>
                              setEditing({
                                id: category.id,
                                nombre: category.nombre,
                                requiereBanco: category.requiereBanco,
                                activo: category.activo,
                              })
                            }
                          >
                            Editar
                          </button>
                          {/* Una categoría con gastos registrados no se puede borrar: el API
                              responde 409 y el mensaje sugiere desactivarla. */}
                          <button
                            className="btn-danger"
                            type="button"
                            onClick={() => void deleteCategory(category.id)}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {categories.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4}>No hay categorías registradas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Nueva categoría</h4>
          <form onSubmit={(e) => void createCategory(e)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 7' }}>
              Nombre
              <input value={newNombre} onChange={(e) => setNewNombre(e.target.value)} required />
            </label>
            <label style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={newRequiereBanco}
                onChange={(e) => setNewRequiereBanco(e.target.checked)}
              />
              Lleva banco
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
