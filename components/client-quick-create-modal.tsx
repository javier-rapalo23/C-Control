'use client';

import { useState, type FormEvent } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (client: ClientDTO) => void;
};

export default function ClientQuickCreateModal({ open, onClose, onCreated }: Props) {
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function createClient(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombres, apellidos }),
      });
      const client = await parseApiResponse<ClientDTO>(response);
      setNombres('');
      setApellidos('');
      onCreated(client);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando cliente');
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 360, margin: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Nuevo cliente</h3>
        <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: -4 }}>
          Datos mínimos. Clave IHCAFE, dirección y RTN se completan luego en Clientes.
        </p>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <form onSubmit={(event) => void createClient(event)} style={{ marginTop: 8 }}>
          <label>
            Nombres
            <input
              value={nombres}
              onChange={(event) => setNombres(event.target.value)}
              placeholder="Nombres del cliente"
              autoFocus
              required
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Apellidos
            <input
              value={apellidos}
              onChange={(event) => setApellidos(event.target.value)}
              placeholder="Apellidos del cliente"
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" disabled={loading || !nombres.trim() || !apellidos.trim()}>
              {loading ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
