'use client';

import { useState, type FormEvent } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ExpenseCategoryDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (category: ExpenseCategoryDTO) => void;
};

/**
 * Alta rápida de una categoría de gasto desde el panel de gastos, para no tener que ir
 * a Mantenimiento a mitad de un registro. Editarla o desactivarla sigue siendo de
 * Mantenimiento → Categorías de gasto.
 */
export default function ExpenseCategoryQuickCreateModal({ open, onClose, onCreated }: Props) {
  const [nombre, setNombre] = useState('');
  const [requiereBanco, setRequiereBanco] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    setError(null);
    onClose();
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const category = await fetch('/api/expense-categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), requiereBanco }),
      }).then(parseApiResponse<ExpenseCategoryDTO>);
      setNombre('');
      setRequiereBanco(false);
      onCreated(category);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando la categoría');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onClick={close}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 420, margin: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Nueva categoría de gasto</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <form onSubmit={(event) => void createCategory(event)} style={{ marginTop: 8 }}>
          <label>
            Nombre
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej. Combustible"
              maxLength={60}
              autoFocus
              required
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={requiereBanco}
              onChange={(event) => setRequiereBanco(event.target.checked)}
              style={{ width: 'auto' }}
            />
            Requiere banco (el gasto se desglosa por banco)
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" type="button" onClick={close} disabled={loading}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" disabled={loading || nombre.trim().length < 2}>
              {loading ? 'Creando...' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
