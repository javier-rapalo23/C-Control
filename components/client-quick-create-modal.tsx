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

const emptyForm = {
  nombres: '',
  apellidos: '',
  claveIhcafe: '',
  telefono: '',
  direccion: '',
  rtn: '',
  cuentaBancaria: '',
  notas: '',
};

export default function ClientQuickCreateModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function setField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createClient(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombres: form.nombres,
          apellidos: form.apellidos,
          claveIhcafe: form.claveIhcafe || undefined,
          telefono: form.telefono || undefined,
          direccion: form.direccion || undefined,
          rtn: form.rtn || undefined,
          cuentaBancaria: form.cuentaBancaria || undefined,
          notas: form.notas || undefined,
        }),
      });
      const client = await parseApiResponse<ClientDTO>(response);
      setForm(emptyForm);
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
        style={{ width: '100%', maxWidth: 420, margin: 0, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Nuevo cliente</h3>
        <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: -4 }}>
          Solo nombres y apellidos son obligatorios. El resto se puede completar luego en Clientes.
        </p>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <form onSubmit={(event) => void createClient(event)} style={{ marginTop: 8 }}>
          <label>
            Nombres
            <input
              value={form.nombres}
              onChange={(event) => setField('nombres', event.target.value)}
              placeholder="Nombres del cliente"
              autoFocus
              required
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Apellidos
            <input
              value={form.apellidos}
              onChange={(event) => setField('apellidos', event.target.value)}
              placeholder="Apellidos del cliente"
              required
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Clave IHCAFE (opcional)
            <input
              value={form.claveIhcafe}
              onChange={(event) => setField('claveIhcafe', event.target.value)}
              placeholder="06-05-09037"
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Teléfono (opcional)
            <input
              value={form.telefono}
              onChange={(event) => setField('telefono', event.target.value)}
              placeholder="Teléfono del cliente"
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Dirección (opcional)
            <input
              value={form.direccion}
              onChange={(event) => setField('direccion', event.target.value)}
              placeholder="Dirección del cliente"
            />
          </label>
          <label style={{ marginTop: 8 }}>
            RTN (opcional)
            <input value={form.rtn} onChange={(event) => setField('rtn', event.target.value)} placeholder="RTN del cliente" />
          </label>
          <label style={{ marginTop: 8 }}>
            Cuenta bancaria (opcional)
            <input
              value={form.cuentaBancaria}
              onChange={(event) => setField('cuentaBancaria', event.target.value)}
              placeholder="Cuenta bancaria del cliente"
            />
          </label>
          <label style={{ marginTop: 8 }}>
            Notas (opcional)
            <input value={form.notas} onChange={(event) => setField('notas', event.target.value)} placeholder="Notas adicionales" />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-secondary" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" disabled={loading || !form.nombres.trim() || !form.apellidos.trim()}>
              {loading ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
