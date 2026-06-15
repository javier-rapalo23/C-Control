'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, LedgerDTO, MaterialDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function SalesPanel() {
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saleDescription, setSaleDescription] = useState('');
  const [saleAmount, setSaleAmount] = useState('');

  // Materials management
  const [showMaterials, setShowMaterials] = useState(false);
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<{ id: string; nombre: string; precioPorLibra: string } | null>(null);
  const [newMatNombre, setNewMatNombre] = useState('');
  const [newMatPrecio, setNewMatPrecio] = useState('');

  // Clients management
  const [showClients, setShowClients] = useState(false);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ledger?businessDate=${businessDate}`, { cache: 'no-store' });
      const data = await parseApiResponse<LedgerDTO>(res);
      setLedger(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  const fetchMaterials = useCallback(async () => {
    try {
      setMaterialsLoading(true);
      const res = await fetch('/api/materials', { cache: 'no-store' });
      const data = await parseApiResponse<MaterialDTO[]>(res);
      setMaterials(data);
      setMaterialsError(null);
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Error cargando materiales');
    } finally {
      setMaterialsLoading(false);
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
    void fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    if (showMaterials) void fetchMaterials();
  }, [showMaterials, fetchMaterials]);

  useEffect(() => {
    if (showClients) void fetchClients();
  }, [showClients, fetchClients]);

  async function createSale(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, descripcion: saleDescription, monto: Number(saleAmount) }),
      }).then(parseApiResponse);
      setSaleDescription('');
      setSaleAmount('');
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando venta');
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/sales/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando venta');
    } finally {
      setLoading(false);
    }
  }

  // --- Materials CRUD ---

  async function createMaterial(event: React.FormEvent) {
    event.preventDefault();
    try {
      setMaterialsLoading(true);
      await fetch('/api/materials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: newMatNombre, precioPorLibra: Number(newMatPrecio) }),
      }).then(parseApiResponse);
      setNewMatNombre('');
      setNewMatPrecio('');
      await fetchMaterials();
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Error creando material');
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function updateMaterial(id: string) {
    if (!editingMaterial) return;
    try {
      setMaterialsLoading(true);
      await fetch(`/api/materials/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: editingMaterial.nombre, precioPorLibra: Number(editingMaterial.precioPorLibra) }),
      }).then(parseApiResponse);
      setEditingMaterial(null);
      await fetchMaterials();
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Error actualizando material');
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function deleteMaterial(id: string) {
    try {
      setMaterialsLoading(true);
      await fetch(`/api/materials/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchMaterials();
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Error eliminando material');
    } finally {
      setMaterialsLoading(false);
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

  return (
    <main className="page-shell">
      <h1>Ventas</h1>
      <p>Registrar ventas y ver ventas del día seleccionado.</p>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <label style={{ gridColumn: 'span 4' }}>
            Fecha de negocio
            <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
          </label>
          <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
            <button className="btn-primary" type="button" onClick={() => void fetchLedger()}>
              Recargar
            </button>
          </div>
          <div style={{ gridColumn: 'span 6', alignSelf: 'end', textAlign: 'right' }}>
            <a href={`/api/export?businessDate=${businessDate}`} target="_blank" rel="noreferrer">
              <button className="btn-primary" type="button">
                Exportar JSON
              </button>
            </a>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <form onSubmit={(e) => void createSale(e)} className="row">
          <label style={{ gridColumn: 'span 8' }}>
            Descripción
            <input value={saleDescription} onChange={(e) => setSaleDescription(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} type="number" step="0.01" required />
          </label>
          <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
            <button className="btn-primary" type="submit">
              Registrar venta
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Ventas del día</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.sales.map((item) => (
              <tr key={item.id}>
                <td>{item.descripcion}</td>
                <td>L {item.monto.toFixed(2)}</td>
                <td>
                  <button className="btn-danger" onClick={() => void removeEntry(item.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Materials management */}
      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Materiales</h3>
          <button className="btn-primary" type="button" onClick={() => setShowMaterials((v) => !v)}>
            {showMaterials ? 'Ocultar' : 'Gestionar'}
          </button>
        </div>

        {showMaterials ? (
          <div style={{ marginTop: 12 }}>
            {materialsError ? <p style={{ color: 'var(--danger)' }}>{materialsError}</p> : null}

            <table className="table-like">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Precio / libra</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) =>
                  editingMaterial?.id === m.id ? (
                    <tr key={m.id}>
                      <td>
                        <input
                          value={editingMaterial.nombre}
                          onChange={(e) => setEditingMaterial((prev) => prev && { ...prev, nombre: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={editingMaterial.precioPorLibra}
                          onChange={(e) => setEditingMaterial((prev) => prev && { ...prev, precioPorLibra: e.target.value })}
                          type="number"
                          step="0.01"
                        />
                      </td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-primary" type="button" onClick={() => void updateMaterial(m.id)}>
                          Guardar
                        </button>
                        <button className="btn-danger" type="button" onClick={() => setEditingMaterial(null)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id}>
                      <td>{m.nombre}</td>
                      <td>L {Number(m.precioPorLibra).toFixed(2)}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn-primary"
                          type="button"
                          onClick={() =>
                            setEditingMaterial({ id: m.id, nombre: m.nombre, precioPorLibra: String(Number(m.precioPorLibra).toFixed(2)) })
                          }
                        >
                          Editar
                        </button>
                        <button className="btn-danger" type="button" onClick={() => void deleteMaterial(m.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                {materials.length === 0 && !materialsLoading ? (
                  <tr>
                    <td colSpan={3}>No hay materiales registrados.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <h4 style={{ marginTop: 16 }}>Nuevo material</h4>
            <form onSubmit={(e) => void createMaterial(e)} className="row" style={{ marginTop: 8 }}>
              <label style={{ gridColumn: 'span 6' }}>
                Nombre
                <input value={newMatNombre} onChange={(e) => setNewMatNombre(e.target.value)} required />
              </label>
              <label style={{ gridColumn: 'span 4' }}>
                Precio por libra
                <input value={newMatPrecio} onChange={(e) => setNewMatPrecio(e.target.value)} type="number" step="0.01" required />
              </label>
              <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
                <button className="btn-primary" type="submit" disabled={materialsLoading}>
                  Agregar
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      {/* Clients management */}
      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Clientes</h3>
          <button className="btn-primary" type="button" onClick={() => setShowClients((v) => !v)}>
            {showClients ? 'Ocultar' : 'Gestionar'}
          </button>
        </div>

        {showClients ? (
          <div style={{ marginTop: 12 }}>
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
          </div>
        ) : null}
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
