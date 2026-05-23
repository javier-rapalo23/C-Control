'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, LedgerDTO, MaterialDTO, PurchaseTransactionDTO } from '@/types/domain';

type CartItem = {
  id: string;
  materialId: string;
  materialNombre: string;
  libras: string;
  precioPorLibra: string;
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function decimalOrZero(input: string) {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

export default function PurchasesPanel() {
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [transactions, setTransactions] = useState<PurchaseTransactionDTO[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');

  const [itemMaterialId, setItemMaterialId] = useState('');
  const [itemLibras, setItemLibras] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  const fetchMaterials = useCallback(async () => {
    const response = await fetch('/api/materials', { cache: 'no-store' });
    const data = await parseApiResponse<MaterialDTO[]>(response);
    setMaterials(data);

    if (!itemMaterialId && data.length > 0) {
      setItemMaterialId(data[0].id);
      setItemPrice(String(Number(data[0].precioPorLibra).toFixed(2)));
    }
  }, [itemMaterialId]);

  const fetchClients = useCallback(async () => {
    const response = await fetch('/api/clients', { cache: 'no-store' });
    const data = await parseApiResponse<ClientDTO[]>(response);
    setClients(data);

    if (!selectedClientId && data.length > 0) {
      setSelectedClientId(data[0].id);
    }
  }, [selectedClientId]);

  const fetchLedger = useCallback(async () => {
    const response = await fetch(`/api/ledger?businessDate=${businessDate}`, { cache: 'no-store' });
    const data = await parseApiResponse<LedgerDTO>(response);
    setLedger(data);
  }, [businessDate]);

  const fetchTransactions = useCallback(async () => {
    const response = await fetch(`/api/purchase-transactions?businessDate=${businessDate}`, { cache: 'no-store' });
    const data = await parseApiResponse<{ businessDate: string | null; transactions: PurchaseTransactionDTO[] }>(response);
    setTransactions(data.transactions);
  }, [businessDate]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchMaterials(), fetchClients(), fetchLedger(), fetchTransactions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sincronizando compras');
    } finally {
      setLoading(false);
    }
  }, [fetchClients, fetchLedger, fetchMaterials, fetchTransactions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const libras = decimalOrZero(item.libras);
        const precioPorLibra = decimalOrZero(item.precioPorLibra);
        return sum + libras * precioPorLibra;
      }, 0),
    [cart],
  );

  async function createClient(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: newClientName }),
      });
      const client = await parseApiResponse<ClientDTO>(response);
      setClients((current) => [client, ...current]);
      setSelectedClientId(client.id);
      setNewClientName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando cliente');
    } finally {
      setLoading(false);
    }
  }

  function addItemToCart(event: FormEvent) {
    event.preventDefault();

    const material = materials.find((entry) => entry.id === itemMaterialId);
    if (!material) {
      setError('Selecciona un material válido');
      return;
    }

    const precioPorLibra = itemPrice || String(Number(material.precioPorLibra).toFixed(2));

    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        materialId: material.id,
        materialNombre: material.nombre,
        libras: itemLibras,
        precioPorLibra,
      },
    ]);

    setItemLibras('');
    setItemPrice(String(Number(material.precioPorLibra).toFixed(2)));
  }

  function updateCartItem(id: string, field: 'libras' | 'precioPorLibra', value: string) {
    setCart((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function removeCartItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  async function saveTransaction(event: FormEvent) {
    event.preventDefault();

    if (!selectedClientId) {
      setError('Selecciona un cliente');
      return;
    }

    if (cart.length === 0) {
      setError('Agrega al menos un item al carrito');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await fetch('/api/purchase-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          clientId: selectedClientId,
          items: cart.map((item) => ({
            materialId: item.materialId,
            libras: Number(item.libras),
            precioPorLibra: Number(item.precioPorLibra),
          })),
        }),
      }).then(parseApiResponse);

      setCart([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando compra por cliente');
    } finally {
      setLoading(false);
    }
  }

  async function deleteTransaction(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/purchase-transactions/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando transacción');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Compras por cliente</h1>
        <p>Selecciona un cliente, agrega varios materiales al carrito y guarda la transacción completa.</p>
      </section>

      <section className="card-grid">
        <article className="card wide">
          <div className="row">
            <label style={{ gridColumn: 'span 3' }}>
              Fecha de negocio
              <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
              <button className="btn-primary" onClick={() => void refresh()} type="button">
                Recargar
              </button>
            </div>
            <div style={{ gridColumn: 'span 7', alignSelf: 'end', textAlign: 'right' }}>
              <a href={`/api/export?businessDate=${businessDate}`} target="_blank" rel="noreferrer">
                <button className="btn-primary" type="button">
                  Exportar JSON
                </button>
              </a>
            </div>
          </div>
          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        </article>

        <article className="card third kpi">
          <div className="label">Saldo actual</div>
          <div className="value">L {ledger?.totals.saldoActual.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Compras del día</div>
          <div className="value">L {ledger?.totals.totalCompras.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Transacciones</div>
          <div className="value"> {transactions.length}</div>
        </article>

        <article className="card half">
          <h3>Cliente</h3>
          <form onSubmit={(event) => void createClient(event)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 8' }}>
              Nuevo cliente
              <input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Nombre del cliente" />
            </label>
            <div style={{ gridColumn: 'span 4', alignSelf: 'end' }}>
              <button className="btn-primary" type="submit">
                Crear cliente
              </button>
            </div>
          </form>
          <label style={{ marginTop: 12 }}>
            Cliente para la compra
            <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.esGeneral ? `${client.nombre} (general)` : client.nombre}
                </option>
              ))}
            </select>
          </label>
        </article>

        <article className="card half">
          <h3>Agregar item al carrito</h3>
          <form onSubmit={(event) => void addItemToCart(event)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 12' }}>
              Material
              <select value={itemMaterialId} onChange={(event) => setItemMaterialId(event.target.value)} required>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nombre} (L{material.precioPorLibra.toFixed(2)})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Libras
              <input value={itemLibras} onChange={(event) => setItemLibras(event.target.value)} type="number" step="0.01" required />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Precio por libra
              <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} type="number" step="0.01" required />
            </label>
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit">
                Agregar al carrito
              </button>
            </div>
          </form>
        </article>

        <article className="card wide">
          <h3>Carrito de compra</h3>
          <table className="table-like" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Material</th>
                <th>Libras</th>
                <th>Precio / libra</th>
                <th>Subtotal</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={5}>Aún no agregaste items al carrito.</td>
                </tr>
              ) : (
                cart.map((item) => {
                  const subtotal = decimalOrZero(item.libras) * decimalOrZero(item.precioPorLibra);
                  return (
                    <tr key={item.id}>
                      <td>{item.materialNombre}</td>
                      <td>
                        <input
                          value={item.libras}
                          onChange={(event) => updateCartItem(item.id, 'libras', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </td>
                      <td>
                        <input
                          value={item.precioPorLibra}
                          onChange={(event) => updateCartItem(item.id, 'precioPorLibra', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </td>
                      <td>L {subtotal.toFixed(2)}</td>
                      <td>
                        <button className="btn-danger" onClick={() => removeCartItem(item.id)} type="button">
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
            <strong>Total carrito: L {cartTotal.toFixed(2)}</strong>
            <button className="btn-primary" type="button" onClick={(event) => void saveTransaction(event as unknown as FormEvent)}>
              Guardar compra por cliente
            </button>
          </div>
        </article>

        <article className="card wide">
          <h3>Transacciones del día</h3>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            {transactions.length === 0 ? <p>No hay transacciones registradas para esta fecha.</p> : null}
            {transactions.map((transaction) => (
              <article key={transaction.id} className="card" style={{ background: 'var(--surface-alt)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{transaction.client.nombre}</strong>
                    <div style={{ color: 'var(--text-soft)' }}>{transaction.items.length} items</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>L {transaction.total.toFixed(2)}</strong>
                    <div>
                      <button className="btn-danger" type="button" onClick={() => void deleteTransaction(transaction.id)}>
                        Eliminar transacción
                      </button>
                    </div>
                  </div>
                </div>
                <table className="table-like" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Libras</th>
                      <th>Precio / libra</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.materialNombre}</td>
                        <td>{item.libras.toFixed(2)}</td>
                        <td>L {item.precioPorLibra.toFixed(2)}</td>
                        <td>L {item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        </article>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
