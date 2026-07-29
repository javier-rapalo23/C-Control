'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Save } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, LedgerDTO, ProductoDTO, PurchaseTransactionDTO } from '@/types/domain';
import { useModuleGuard } from '@/lib/use-module-guard';
import { useSucursal } from '@/lib/use-sucursal';
import ClientQuickCreateModal from '@/components/client-quick-create-modal';

type CartItem = {
  id: string;
  productoId: string;
  productoNombre: string;
  pesoBruto: string;
  numeroSacos: string;
  taraPorSaco: string;
  precioPorLibra: string;
  factorConversionOro: number;
};

function computeDerived(item: { pesoBruto: string; numeroSacos: string; taraPorSaco: string; precioPorLibra: string; factorConversionOro: number }) {
  const pesoBruto = Number(item.pesoBruto) || 0;
  const numeroSacos = Number(item.numeroSacos) || 0;
  const taraPorSaco = Number(item.taraPorSaco) || 0;
  const precioPorLibra = Number(item.precioPorLibra) || 0;
  const taraTotal = numeroSacos * taraPorSaco;
  const pesoNeto = Math.max(0, pesoBruto - taraTotal);
  const quintalesOro = (pesoNeto / 100) * (item.factorConversionOro || 1);
  const subtotal = pesoNeto * precioPorLibra;
  return { pesoNeto, quintalesOro, subtotal };
}

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


const RAWBT_STORAGE_KEY = 'rcontrol_rawbt_enabled';

export default function PurchasesPanel() {
  const roleGuardStatus = useModuleGuard('purchases');
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [productos, setProductos] = useState<ProductoDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [transactions, setTransactions] = useState<PurchaseTransactionDTO[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [rawbtEnabled, setRawbtEnabled] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientModalOpen, setClientModalOpen] = useState(false);

  const [saldoInicial, setSaldoInicial] = useState('');

  const [itemProductoId, setItemProductoId] = useState('');
  const [itemPesoBruto, setItemPesoBruto] = useState('');
  const [itemNumeroSacos, setItemNumeroSacos] = useState('');
  const [itemTaraPorSaco, setItemTaraPorSaco] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  const fetchProductos = useCallback(async () => {
    const response = await fetch('/api/productos', { cache: 'no-store' });
    const data = await parseApiResponse<ProductoDTO[]>(response);
    setProductos(data);

    if (!itemProductoId && data.length > 0) {
      setItemProductoId(data[0].id);
      setItemPrice(String(Number(data[0].precioPorLibra).toFixed(2)));
      setItemTaraPorSaco(data[0].taraPorSaco !== null && data[0].taraPorSaco !== undefined ? String(data[0].taraPorSaco) : '');
    }
  }, [itemProductoId]);

  const fetchClients = useCallback(async () => {
    const response = await fetch('/api/clients', { cache: 'no-store' });
    const data = await parseApiResponse<ClientDTO[]>(response);
    setClients(data);

    if (!selectedClientId && data.length > 0) {
      setSelectedClientId(data[0].id);
    }
  }, [selectedClientId]);

  const fetchLedger = useCallback(async () => {
    const response = await fetch(`/api/ledger?businessDate=${businessDate}&sucursalId=${sucursalId}`, { cache: 'no-store' });
    const data = await parseApiResponse<LedgerDTO>(response);
    setLedger(data);
    setSaldoInicial(data.balance.saldoInicial.toFixed(2));
  }, [businessDate, sucursalId]);

  const fetchTransactions = useCallback(async () => {
    const response = await fetch(`/api/purchase-transactions?businessDate=${businessDate}&sucursalId=${sucursalId}`, {
      cache: 'no-store',
    });
    const data = await parseApiResponse<{ businessDate: string | null; transactions: PurchaseTransactionDTO[] }>(response);
    setTransactions(data.transactions);
  }, [businessDate, sucursalId]);

  const refresh = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchProductos(), fetchClients(), fetchLedger(), fetchTransactions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sincronizando compras');
    } finally {
      setLoading(false);
    }
  }, [fetchClients, fetchLedger, fetchProductos, fetchTransactions, sucursalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setRawbtEnabled(localStorage.getItem(RAWBT_STORAGE_KEY) === 'true');
  }, []);

  function toggleRawbt(value: boolean) {
    setRawbtEnabled(value);
    localStorage.setItem(RAWBT_STORAGE_KEY, value ? 'true' : 'false');
  }

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + computeDerived(item).subtotal, 0),
    [cart],
  );

  function handleClientCreated(client: ClientDTO) {
    setClients((current) => [client, ...current]);
    setSelectedClientId(client.id);
  }

  function addItemToCart(event: FormEvent) {
    event.preventDefault();

    const producto = productos.find((entry) => entry.id === itemProductoId);
    if (!producto) {
      setError('Selecciona un producto válido');
      return;
    }

    const precioPorLibra = itemPrice || String(Number(producto.precioPorLibra).toFixed(2));
    const taraPorSaco = itemTaraPorSaco || String(producto.taraPorSaco ?? 0);

    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productoId: producto.id,
        productoNombre: producto.nombre,
        pesoBruto: itemPesoBruto,
        numeroSacos: itemNumeroSacos || '0',
        taraPorSaco,
        precioPorLibra,
        factorConversionOro: producto.factorConversionOro ?? 1,
      },
    ]);

    setItemPesoBruto('');
    setItemNumeroSacos('');
    setItemPrice(String(Number(producto.precioPorLibra).toFixed(2)));
    setItemTaraPorSaco(producto.taraPorSaco !== null && producto.taraPorSaco !== undefined ? String(producto.taraPorSaco) : '');
  }

  function updateCartItem(id: string, field: 'pesoBruto' | 'numeroSacos' | 'taraPorSaco' | 'precioPorLibra', value: string) {
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
          sucursalId,
          clientId: selectedClientId,
          items: cart.map((item) => ({
            productoId: item.productoId,
            pesoBruto: Number(item.pesoBruto),
            numeroSacos: Number(item.numeroSacos) || 0,
            taraPorSaco: Number(item.taraPorSaco) || 0,
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

  async function saveSaldoInicial() {
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/ledger/initial-balance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, sucursalId, saldoInicial: Number(saldoInicial) }),
      }).then(parseApiResponse);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando saldo inicial');
    } finally {
      setLoading(false);
    }
  }

  async function printTicket(transaction: PurchaseTransactionDTO) {
    try {
      setError(null);
      setPrintingId(transaction.id);

      if (rawbtEnabled) {
        const { payloadB64 } = await fetch(`/api/print/ticket/data?transactionId=${transaction.id}`, {
          cache: 'no-store',
        }).then(parseApiResponse<{ payloadB64: string }>);
        window.location.href = `rawbt:base64,${payloadB64}`;
        return;
      }

      const { jobId } = await fetch('/api/print/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id }),
      }).then(parseApiResponse<{ jobId: string; status: string }>);

      const deadline = Date.now() + 20000;
      let status = 'pending';
      let jobError: string | null = null;

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const job = await fetch(`/api/print/jobs/${jobId}`, { cache: 'no-store' }).then(
          parseApiResponse<{ status: string; error: string | null }>,
        );
        status = job.status;
        jobError = job.error;
        if (status === 'done' || status === 'error') break;
      }

      if (status === 'error') {
        setError(jobError || 'Error imprimiendo ticket');
      } else if (status !== 'done') {
        setError('La impresora no respondió a tiempo. Verifica que esté encendida y conectada a la red.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error imprimiendo ticket');
    } finally {
      setPrintingId(null);
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

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Compras por cliente</h1>
        <p>Selecciona un cliente, agrega varios productos al carrito y guarda la transacción completa.</p>
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
          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        </article>
        <article className="card half">
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <label style={{ flex: 1 }}>
              Saldo Inicial
              <input value={saldoInicial} onChange={(event) => setSaldoInicial(event.target.value)} type="number" step="0.01" />
            </label>
            <button
              className="btn-primary"
              type="button"
              onClick={() => void saveSaldoInicial()}
              aria-label="Guardar saldo inicial"
              style={{ flexShrink: 0, width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Save size={16} aria-hidden="true" />
            </button>
          </div>
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
          <label style={{ marginTop: 8 }}>
            Cliente para la compra
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                style={{ flex: 1 }}
              >
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
        </article>

        <ClientQuickCreateModal
          open={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          onCreated={handleClientCreated}
        />

        <article className="card wide">
          <h3>Agregar item al carrito</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 10 }}>
            {productos.map((producto) => {
              const selected = itemProductoId === producto.id;
              return (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => {
                    setItemProductoId(producto.id);
                    setItemPrice(String(Number(producto.precioPorLibra).toFixed(2)));
                    setItemTaraPorSaco(producto.taraPorSaco !== null && producto.taraPorSaco !== undefined ? String(producto.taraPorSaco) : '');
                  }}
                  style={{
                    padding: '12px 10px',
                    border: `2px solid ${selected ? 'var(--ring)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius)',
                    background: selected ? 'var(--ring-soft)' : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: selected ? 'var(--ring)' : 'inherit' }}>
                    {producto.nombre}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 3 }}>
                    L {Number(producto.precioPorLibra).toFixed(2)} / lb
                  </div>
                </button>
              );
            })}
          </div>

          <form onSubmit={(event) => void addItemToCart(event)} className="row" style={{ marginTop: 14 }}>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Peso bruto (lb)
              <input value={itemPesoBruto} onChange={(event) => setItemPesoBruto(event.target.value)} type="number" step="0.01" required />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Número de sacos
              <input value={itemNumeroSacos} onChange={(event) => setItemNumeroSacos(event.target.value)} type="number" step="1" min="0" />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Tara / saco (lb)
              <input value={itemTaraPorSaco} onChange={(event) => setItemTaraPorSaco(event.target.value)} type="number" step="0.01" />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Precio por libra
              <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} type="number" step="0.01" required />
            </label>
            {(() => {
              const producto = productos.find((entry) => entry.id === itemProductoId);
              const preview = computeDerived({
                pesoBruto: itemPesoBruto,
                numeroSacos: itemNumeroSacos,
                taraPorSaco: itemTaraPorSaco,
                precioPorLibra: itemPrice,
                factorConversionOro: producto?.factorConversionOro ?? 1,
              });
              return (
                <div style={{ gridColumn: 'span 12', display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-soft)' }}>
                  <span>
                    Peso neto: <strong style={{ color: 'var(--text-main)' }}>{preview.pesoNeto.toFixed(2)} lb</strong>
                  </span>
                  <span>
                    Quintales oro: <strong style={{ color: 'var(--text-main)' }}>{preview.quintalesOro.toFixed(2)}</strong>
                  </span>
                  <span>
                    Subtotal: <strong style={{ color: 'var(--text-main)' }}>L {preview.subtotal.toFixed(2)}</strong>
                  </span>
                </div>
              );
            })()}
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={!itemProductoId}>
                Agregar al carrito
              </button>
            </div>
          </form>
        </article>

        <article className="card wide">
          <h3>Carrito de compra</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {cart.length === 0 ? (
              <p style={{ color: 'var(--text-soft)', margin: 0 }}>Aún no agregaste items al carrito.</p>
            ) : (
              cart.map((item) => {
                const derived = computeDerived(item);
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      padding: '10px 12px',
                      background: 'var(--surface-alt)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.productoNombre}</strong>
                      <button className="btn-danger" onClick={() => removeCartItem(item.id)} type="button" style={{ flexShrink: 0, padding: '4px 10px', fontSize: 12 }}>
                        Eliminar
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ flex: '1 1 90px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Peso bruto</span>
                        <input
                          value={item.pesoBruto}
                          onChange={(event) => updateCartItem(item.id, 'pesoBruto', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <label style={{ flex: '1 1 80px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Sacos</span>
                        <input
                          value={item.numeroSacos}
                          onChange={(event) => updateCartItem(item.id, 'numeroSacos', event.target.value)}
                          type="number"
                          step="1"
                          min="0"
                        />
                      </label>
                      <label style={{ flex: '1 1 90px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Tara/saco</span>
                        <input
                          value={item.taraPorSaco}
                          onChange={(event) => updateCartItem(item.id, 'taraPorSaco', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <label style={{ flex: '1 1 90px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Precio / libra</span>
                        <input
                          value={item.precioPorLibra}
                          onChange={(event) => updateCartItem(item.id, 'precioPorLibra', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Peso neto</div>
                        <strong>{derived.pesoNeto.toFixed(2)} lb</strong>
                      </div>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Qq oro</div>
                        <strong>{derived.quintalesOro.toFixed(2)}</strong>
                      </div>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Subtotal</div>
                        <strong>L {derived.subtotal.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
            <strong>Total carrito: L {cartTotal.toFixed(2)}</strong>
            <button className="btn-primary" type="button" onClick={(event) => void saveTransaction(event as unknown as FormEvent)}>
              Guardar compra por cliente
            </button>
          </div>
        </article>

        <article className="card wide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3>Transacciones del día</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={rawbtEnabled} onChange={(e) => toggleRawbt(e.target.checked)} />
              Imprimir con RawBT en este dispositivo
            </label>
          </div>
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
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={printingId === transaction.id}
                        onClick={() => void printTicket(transaction)}
                      >
                        {printingId === transaction.id ? 'Imprimiendo...' : 'Imprimir'}
                      </button>
                      <button className="btn-danger" type="button" onClick={() => void deleteTransaction(transaction.id)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
                <table className="table-like" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Peso bruto</th>
                      <th>Sacos</th>
                      <th>Peso neto</th>
                      <th>Qq oro</th>
                      <th>Precio / libra</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productoNombre}</td>
                        <td>{item.pesoBruto !== null && item.pesoBruto !== undefined ? item.pesoBruto.toFixed(2) : '—'}</td>
                        <td>{item.numeroSacos ?? '—'}</td>
                        <td>{item.libras.toFixed(2)}</td>
                        <td>{item.quintalesOro !== null && item.quintalesOro !== undefined ? item.quintalesOro.toFixed(2) : '—'}</td>
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
