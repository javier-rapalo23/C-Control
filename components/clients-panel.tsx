'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, ClienteOriginalDTO } from '@/types/domain';
import MaintenanceTabs from '@/components/maintenance-tabs';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type EditingClient = {
  id: string;
  nombres: string;
  apellidos: string;
  claveIhcafe: string;
  direccion: string;
  rtn: string;
  telefono: string;
  cuentaBancaria: string;
  notas: string;
};

type NewOriginalForm = {
  nombres: string;
  apellidos: string;
  claveIhcafe: string;
};

export default function ClientsPanel() {
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingClient, setEditingClient] = useState<EditingClient | null>(null);

  const [newNombres, setNewNombres] = useState('');
  const [newApellidos, setNewApellidos] = useState('');
  const [newClaveIhcafe, setNewClaveIhcafe] = useState('');
  const [newDireccion, setNewDireccion] = useState('');
  const [newRtn, setNewRtn] = useState('');
  const [newTelefono, setNewTelefono] = useState('');

  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [originalesByClient, setOriginalesByClient] = useState<Record<string, ClienteOriginalDTO[]>>({});
  const [originalesLoading, setOriginalesLoading] = useState(false);
  const [originalesError, setOriginalesError] = useState<string | null>(null);
  const [newOriginal, setNewOriginal] = useState<NewOriginalForm>({ nombres: '', apellidos: '', claveIhcafe: '' });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/clients', { cache: 'no-store' });
      const data = await parseApiResponse<ClientDTO[]>(response);
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  async function createClient(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombres: newNombres,
          apellidos: newApellidos,
          claveIhcafe: newClaveIhcafe || undefined,
          direccion: newDireccion || undefined,
          rtn: newRtn || undefined,
          telefono: newTelefono || undefined,
        }),
      }).then(parseApiResponse);
      setNewNombres('');
      setNewApellidos('');
      setNewClaveIhcafe('');
      setNewDireccion('');
      setNewRtn('');
      setNewTelefono('');
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando cliente');
      setLoading(false);
    }
  }

  async function updateClient(id: string) {
    if (!editingClient) return;
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombres: editingClient.nombres,
          apellidos: editingClient.apellidos,
          claveIhcafe: editingClient.claveIhcafe || undefined,
          direccion: editingClient.direccion || undefined,
          rtn: editingClient.rtn || undefined,
          telefono: editingClient.telefono || undefined,
          cuentaBancaria: editingClient.cuentaBancaria || undefined,
          notas: editingClient.notas || undefined,
        }),
      }).then(parseApiResponse);
      setEditingClient(null);
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando cliente');
      setLoading(false);
    }
  }

  async function deleteClient(id: string) {
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/clients/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando cliente');
      setLoading(false);
    }
  }

  async function toggleOriginales(client: ClientDTO) {
    if (expandedClientId === client.id) {
      setExpandedClientId(null);
      return;
    }

    setExpandedClientId(client.id);
    setNewOriginal({ nombres: '', apellidos: '', claveIhcafe: client.claveIhcafe ?? '' });

    if (!originalesByClient[client.id]) {
      try {
        setOriginalesLoading(true);
        setOriginalesError(null);
        const response = await fetch(`/api/clients/${client.id}/originales`, { cache: 'no-store' });
        const data = await parseApiResponse<ClienteOriginalDTO[]>(response);
        setOriginalesByClient((current) => ({ ...current, [client.id]: data }));
      } catch (err) {
        setOriginalesError(err instanceof Error ? err.message : 'Error cargando productores');
      } finally {
        setOriginalesLoading(false);
      }
    }
  }

  async function addOriginal(clientId: string, event: React.FormEvent) {
    event.preventDefault();
    try {
      setOriginalesLoading(true);
      setOriginalesError(null);
      const response = await fetch(`/api/clients/${clientId}/originales`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newOriginal),
      });
      const created = await parseApiResponse<ClienteOriginalDTO>(response);
      setOriginalesByClient((current) => ({
        ...current,
        [clientId]: [created, ...(current[clientId] ?? [])],
      }));
      const client = clients.find((c) => c.id === clientId);
      setNewOriginal({ nombres: '', apellidos: '', claveIhcafe: client?.claveIhcafe ?? '' });
    } catch (err) {
      setOriginalesError(err instanceof Error ? err.message : 'Error agregando productor');
    } finally {
      setOriginalesLoading(false);
    }
  }

  async function deleteOriginal(clientId: string, originalId: string) {
    try {
      setOriginalesLoading(true);
      setOriginalesError(null);
      await fetch(`/api/clients/${clientId}/originales/${originalId}`, { method: 'DELETE' }).then(parseApiResponse);
      setOriginalesByClient((current) => ({
        ...current,
        [clientId]: (current[clientId] ?? []).filter((o) => o.id !== originalId),
      }));
    } catch (err) {
      setOriginalesError(err instanceof Error ? err.message : 'Error eliminando productor');
    } finally {
      setOriginalesLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Clientes</h1>
        <p>Datos de clientes y, cuando aplica, sus productores originales ligados a la clave IHCAFE.</p>
      </section>

      <MaintenanceTabs />

      <section className="card-grid">
        {error ? (
          <article className="card wide">
            <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          </article>
        ) : null}

        <article className="card wide">
          <h3>Clientes registrados</h3>

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Clave IHCAFE</th>
                <th>Dirección</th>
                <th>RTN</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) =>
                editingClient?.id === client.id ? (
                  <tr key={client.id}>
                    <td>
                      <input
                        value={editingClient.nombres}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, nombres: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editingClient.apellidos}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, apellidos: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editingClient.claveIhcafe}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, claveIhcafe: e.target.value })}
                        placeholder="06-05-09037"
                      />
                    </td>
                    <td>
                      <input
                        value={editingClient.direccion}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, direccion: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editingClient.rtn}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, rtn: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={editingClient.telefono}
                        onChange={(e) => setEditingClient((prev) => prev && { ...prev, telefono: e.target.value })}
                      />
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-primary" type="button" onClick={() => void updateClient(client.id)}>
                        Guardar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => setEditingClient(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <Fragment key={client.id}>
                    <tr>
                      <td>{client.nombres ?? client.nombre}</td>
                      <td>{client.apellidos ?? ''}</td>
                      <td>{client.claveIhcafe ?? '—'}</td>
                      <td>{client.direccion ?? '—'}</td>
                      <td>{client.rtn ?? '—'}</td>
                      <td>{client.telefono ?? '—'}</td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() =>
                            setEditingClient({
                              id: client.id,
                              nombres: client.nombres ?? '',
                              apellidos: client.apellidos ?? '',
                              claveIhcafe: client.claveIhcafe ?? '',
                              direccion: client.direccion ?? '',
                              rtn: client.rtn ?? '',
                              telefono: client.telefono ?? '',
                              cuentaBancaria: client.cuentaBancaria ?? '',
                              notas: client.notas ?? '',
                            })
                          }
                        >
                          Editar
                        </button>
                        <button className="btn-secondary" type="button" onClick={() => void toggleOriginales(client)}>
                          {expandedClientId === client.id ? 'Ocultar productores' : 'Productores'}
                        </button>
                        {!client.esGeneral ? (
                          <button className="btn-danger" type="button" onClick={() => void deleteClient(client.id)}>
                            Eliminar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expandedClientId === client.id ? (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--surface-alt)' }}>
                          <div style={{ padding: '8px 4px' }}>
                            <strong style={{ fontSize: 13 }}>Productores originales de {client.nombre}</strong>
                            {originalesError ? <p style={{ color: 'var(--danger)' }}>{originalesError}</p> : null}

                            <table className="table-like" style={{ marginTop: 8 }}>
                              <thead>
                                <tr>
                                  <th>Nombres</th>
                                  <th>Apellidos</th>
                                  <th>Clave IHCAFE</th>
                                  <th>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(originalesByClient[client.id] ?? []).map((original) => (
                                  <tr key={original.id}>
                                    <td>{original.nombres}</td>
                                    <td>{original.apellidos}</td>
                                    <td>{original.claveIhcafe}</td>
                                    <td>
                                      <button
                                        className="btn-danger"
                                        type="button"
                                        onClick={() => void deleteOriginal(client.id, original.id)}
                                      >
                                        Eliminar
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {(originalesByClient[client.id] ?? []).length === 0 && !originalesLoading ? (
                                  <tr>
                                    <td colSpan={4}>Sin productores registrados.</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>

                            <form
                              onSubmit={(e) => void addOriginal(client.id, e)}
                              className="row"
                              style={{ marginTop: 10 }}
                            >
                              <label style={{ gridColumn: 'span 4' }}>
                                Nombres
                                <input
                                  value={newOriginal.nombres}
                                  onChange={(e) => setNewOriginal((prev) => ({ ...prev, nombres: e.target.value }))}
                                  required
                                />
                              </label>
                              <label style={{ gridColumn: 'span 4' }}>
                                Apellidos
                                <input
                                  value={newOriginal.apellidos}
                                  onChange={(e) => setNewOriginal((prev) => ({ ...prev, apellidos: e.target.value }))}
                                  required
                                />
                              </label>
                              <label style={{ gridColumn: 'span 3' }}>
                                Clave IHCAFE
                                <input
                                  value={newOriginal.claveIhcafe}
                                  onChange={(e) => setNewOriginal((prev) => ({ ...prev, claveIhcafe: e.target.value }))}
                                  placeholder="06-05-09037"
                                  required
                                />
                              </label>
                              <div style={{ gridColumn: 'span 1', alignSelf: 'end' }}>
                                <button className="btn-primary" type="submit" disabled={originalesLoading}>
                                  +
                                </button>
                              </div>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ),
              )}
              {clients.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7}>No hay clientes registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Nuevo cliente</h4>
          <form onSubmit={(e) => void createClient(e)} className="row" style={{ marginTop: 8 }}>
            {/* Dos filas de tres campos: identidad arriba, contacto abajo. Repartir
                cinco campos en la primera fila dejaba la clave, el RTN y el teléfono
                en columnas de dos, demasiado angostas para lo que se escribe en ellas. */}
            <label style={{ gridColumn: 'span 4' }}>
              Nombres
              <input value={newNombres} onChange={(e) => setNewNombres(e.target.value)} required />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              Apellidos
              <input value={newApellidos} onChange={(e) => setNewApellidos(e.target.value)} required />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              Clave IHCAFE
              <input value={newClaveIhcafe} onChange={(e) => setNewClaveIhcafe(e.target.value)} placeholder="06-05-09037" />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              RTN
              <input value={newRtn} onChange={(e) => setNewRtn(e.target.value)} />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              Teléfono
              <input value={newTelefono} onChange={(e) => setNewTelefono(e.target.value)} />
            </label>
            <label style={{ gridColumn: 'span 4' }}>
              Dirección
              <input value={newDireccion} onChange={(e) => setNewDireccion(e.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={loading}>
                Agregar cliente
              </button>
            </div>
          </form>
        </article>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
