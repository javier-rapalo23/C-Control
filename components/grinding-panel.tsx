'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, GrindingServiceDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';
import ClientQuickCreateModal from '@/components/client-quick-create-modal';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Cuánto sale la libra con lo cobrado; solo informativo, el monto manda. */
function precioPorLibra(libras: string, monto: string) {
  const lb = Number(libras);
  const total = Number(monto);
  return lb > 0 && total > 0 ? total / lb : null;
}

type Draft = { libras: string; monto: string };

export default function GrindingPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [services, setServices] = useState<GrindingServiceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [libras, setLibras] = useState('');
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');

  // Ediciones sin guardar de la lista del día, por id de servicio.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    const data = await fetch('/api/clients', { cache: 'no-store' }).then(parseApiResponse<ClientDTO[]>);
    setClients(data);
    setSelectedClientId((current) => current || data[0]?.id || '');
  }, []);

  const fetchServices = useCallback(async () => {
    const data = await fetch(`/api/grinding-services?businessDate=${businessDate}&sucursalId=${sucursalId}`, {
      cache: 'no-store',
    }).then(parseApiResponse<GrindingServiceDTO[]>);
    setServices(data);
    setDrafts({});
  }, [businessDate, sucursalId]);

  const refresh = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchClients(), fetchServices()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sincronizando molido');
    } finally {
      setLoading(false);
    }
  }, [fetchClients, fetchServices, sucursalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = useMemo(
    () => ({
      libras: services.reduce((sum, service) => sum + service.libras, 0),
      monto: services.reduce((sum, service) => sum + service.monto, 0),
    }),
    [services],
  );

  const precioNuevo = precioPorLibra(libras, monto);

  function handleClientCreated(client: ClientDTO) {
    setClients((current) => [client, ...current]);
    setSelectedClientId(client.id);
  }

  async function registrar(event: FormEvent) {
    event.preventDefault();

    if (!selectedClientId) {
      setError('Selecciona un cliente');
      return;
    }
    if (!(Number(libras) > 0) || !(Number(monto) > 0)) {
      setError('Escribe las libras y el monto a cobrar');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await fetch('/api/grinding-services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          clientId: selectedClientId,
          libras: Number(libras),
          monto: Number(monto),
          notas: notas.trim() || undefined,
        }),
      }).then(parseApiResponse);

      setLibras('');
      setMonto('');
      setNotas('');
      await fetchServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el molido');
    } finally {
      setLoading(false);
    }
  }

  function draftOf(service: GrindingServiceDTO): Draft {
    return drafts[service.id] ?? { libras: String(service.libras), monto: String(service.monto) };
  }

  function editDraft(service: GrindingServiceDTO, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [service.id]: { ...draftOf(service), ...patch } }));
  }

  async function guardarCambios(service: GrindingServiceDTO) {
    const draft = draftOf(service);
    if (!(Number(draft.libras) > 0) || !(Number(draft.monto) > 0)) {
      setError('Las libras y el monto deben ser mayores que cero');
      return;
    }

    try {
      setSavingId(service.id);
      setError(null);
      const updated = await fetch(`/api/grinding-services/${service.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ libras: Number(draft.libras), monto: Number(draft.monto) }),
      }).then(parseApiResponse<GrindingServiceDTO>);

      setServices((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[service.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando cambios');
    } finally {
      setSavingId(null);
    }
  }

  async function eliminar(id: string) {
    try {
      setLoading(true);
      setError(null);
      await fetch(`/api/grinding-services/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando el servicio');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Servicio de molido</h1>
        <p>Registra el café que se muele para un cliente: las libras y lo que se le cobra. El cobro entra a la caja del día.</p>
      </section>

      <section className="card-grid">
        <article className="card half">
          <div className="row" style={{ gap: '12px 24px' }}>
            <label style={{ gridColumn: 'span 6' }}>
              Sucursal
              <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
                {sucursales.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Fecha de negocio
              <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </label>
          </div>
          <ErrorToast message={error} onClose={() => setError(null)} />
        </article>
        <article className="card half kpi">
          <div className="label">Cobrado por molido</div>
          <div className="value">L {totals.monto.toFixed(2)}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Libras molidas</div>
          <div className="value">{totals.libras.toFixed(2)}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Servicios</div>
          <div className="value">{services.length}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Promedio por libra</div>
          <div className="value">L {totals.libras > 0 ? (totals.monto / totals.libras).toFixed(2) : '0.00'}</div>
        </article>

        <article className="card wide">
          <h3>Registrar molido</h3>
          <form onSubmit={(event) => void registrar(event)} className="row" style={{ marginTop: 8 }}>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 6' }}>
              Cliente
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} style={{ flex: 1 }}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.esGeneral ? `${client.nombre} (general)` : client.nombre}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setClientModalOpen(true)}
                  aria-label="Nuevo cliente"
                  style={{ flexShrink: 0, width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Libras
              <input value={libras} onChange={(event) => setLibras(event.target.value)} type="number" step="0.01" min="0" required />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Monto a cobrar (L)
              <input value={monto} onChange={(event) => setMonto(event.target.value)} type="number" step="0.01" min="0" required />
            </label>
            <label style={{ gridColumn: 'span 12' }}>
              Notas
              <input value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="opcional" maxLength={250} />
            </label>
            <div style={{ gridColumn: 'span 12', fontSize: 13, color: 'var(--text-soft)' }}>
              Precio por libra: <strong style={{ color: 'var(--text-main)' }}>{precioNuevo !== null ? `L ${precioNuevo.toFixed(2)}` : '—'}</strong>
            </div>
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={loading}>
                Registrar molido
              </button>
            </div>
          </form>
        </article>

        <ClientQuickCreateModal open={clientModalOpen} onClose={() => setClientModalOpen(false)} onCreated={handleClientCreated} />

        <article className="card wide">
          <h3>Molidos del día</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 4 }}>
            Las libras y el monto se pueden corregir mientras la caja del día esté abierta.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Libras</th>
                  <th>Monto (L)</th>
                  <th>L / lb</th>
                  <th>Notas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No hay molidos registrados en esta fecha.</td>
                  </tr>
                ) : null}
                {services.map((service) => {
                  const draft = draftOf(service);
                  const dirty = draft.libras !== String(service.libras) || draft.monto !== String(service.monto);
                  const precio = precioPorLibra(draft.libras, draft.monto);
                  return (
                    <tr key={service.id}>
                      <td>{service.clientNombre}</td>
                      <td>
                        <input
                          value={draft.libras}
                          onChange={(event) => editDraft(service, { libras: event.target.value })}
                          type="number"
                          step="0.01"
                          min="0"
                          style={{ maxWidth: 110 }}
                        />
                      </td>
                      <td>
                        <input
                          value={draft.monto}
                          onChange={(event) => editDraft(service, { monto: event.target.value })}
                          type="number"
                          step="0.01"
                          min="0"
                          style={{ maxWidth: 120 }}
                        />
                      </td>
                      <td>{precio !== null ? precio.toFixed(2) : '—'}</td>
                      <td>{service.notas ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn-primary"
                            type="button"
                            disabled={!dirty || savingId !== null}
                            onClick={() => void guardarCambios(service)}
                          >
                            {savingId === service.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button className="btn-danger" type="button" disabled={loading} onClick={() => void eliminar(service.id)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {services.length > 0 ? (
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{totals.libras.toFixed(2)}</strong>
                    </td>
                    <td colSpan={4}>
                      <strong>L {totals.monto.toFixed(2)}</strong>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <LoadingOverlay active={loading || savingId !== null} />
    </main>
  );
}
