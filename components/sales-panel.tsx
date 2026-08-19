'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, LedgerDTO, ProductoDTO, SaleTransactionDTO } from '@/types/domain';
import { useModuleGuard } from '@/lib/use-module-guard';
import { useSucursal } from '@/lib/use-sucursal';
import { groupProductos, isCafeCategoria } from '@/lib/producto-groups';
import ClientQuickCreateModal from '@/components/client-quick-create-modal';

type CartItem =
  | {
      id: string;
      mode: 'legacy';
      productoId: string;
      productoNombre: string;
      libras: string;
      precioPorLibra: string;
    }
  | {
      id: string;
      mode: 'oro';
      productoId: string;
      productoNombre: string;
      libras: string;
      porcentajeOro: string;
      precioPorQuintalOro: string;
    };

const ORO_DIVISOR = 1.25;

function computeOroDerived(item: { libras: string; porcentajeOro: string; precioPorQuintalOro: string }) {
  const libras = Number(item.libras) || 0;
  const porcentajeOro = Number(item.porcentajeOro) || 0;
  const precioPorQuintalOro = Number(item.precioPorQuintalOro) || 0;
  const quintalesVendidas = libras / 100;
  const quintalesOro = (quintalesVendidas * (porcentajeOro / 100)) / ORO_DIVISOR;
  const total = quintalesOro * precioPorQuintalOro;
  return { quintalesVendidas, quintalesOro, total };
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

function decimalOrZero(input: string) {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

const RAWBT_STORAGE_KEY = 'rcontrol_rawbt_enabled';

export default function SalesPanel() {
  const roleGuardStatus = useModuleGuard('sales');
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [productos, setProductos] = useState<ProductoDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [transactions, setTransactions] = useState<SaleTransactionDTO[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [rawbtEnabled, setRawbtEnabled] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientModalOpen, setClientModalOpen] = useState(false);

  const [itemProductoId, setItemProductoId] = useState('');
  const [itemLibras, setItemLibras] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemPorcentajeOro, setItemPorcentajeOro] = useState('');
  const [itemPrecioPorQuintalOro, setItemPrecioPorQuintalOro] = useState('');

  const fetchProductos = useCallback(async () => {
    const response = await fetch('/api/productos', { cache: 'no-store' });
    const data = await parseApiResponse<ProductoDTO[]>(response);
    setProductos(data);

    if (!itemProductoId && data.length > 0) {
      setItemProductoId(data[0].id);
      setItemPrice(String(Number(data[0].precioPorLibra).toFixed(2)));
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
  }, [businessDate, sucursalId]);

  const fetchTransactions = useCallback(async () => {
    const response = await fetch(`/api/sale-transactions?businessDate=${businessDate}&sucursalId=${sucursalId}`, {
      cache: 'no-store',
    });
    const data = await parseApiResponse<{ businessDate: string | null; transactions: SaleTransactionDTO[] }>(response);
    setTransactions(data.transactions);
  }, [businessDate, sucursalId]);

  const refresh = useCallback(async () => {
    if (!sucursalId) return;
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchProductos(), fetchClients(), fetchLedger(), fetchTransactions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sincronizando ventas');
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
    () =>
      cart.reduce((sum, item) => {
        if (item.mode === 'oro') return sum + computeOroDerived(item).total;
        return sum + decimalOrZero(item.libras) * decimalOrZero(item.precioPorLibra);
      }, 0),
    [cart],
  );

  const productoGroups = useMemo(() => groupProductos(productos), [productos]);
  const selectedProducto = useMemo(() => productos.find((entry) => entry.id === itemProductoId), [productos, itemProductoId]);
  const isOroMode = selectedProducto ? isCafeCategoria(selectedProducto) : false;

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

    if (isCafeCategoria(producto)) {
      if (!itemPorcentajeOro || Number(itemPorcentajeOro) <= 0) {
        setError('Indica el % Oro para este producto (o configúralo en Inventario)');
        return;
      }
      if (!itemPrecioPorQuintalOro || Number(itemPrecioPorQuintalOro) <= 0) {
        setError('Indica el precio por quintal Oro');
        return;
      }

      setError(null);
      setCart((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          mode: 'oro',
          productoId: producto.id,
          productoNombre: producto.nombre,
          libras: itemLibras,
          porcentajeOro: itemPorcentajeOro,
          precioPorQuintalOro: itemPrecioPorQuintalOro,
        },
      ]);

      setItemLibras('');
      setItemPrecioPorQuintalOro('');
      return;
    }

    const precioPorLibra = itemPrice || String(Number(producto.precioPorLibra).toFixed(2));

    setError(null);
    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        mode: 'legacy',
        productoId: producto.id,
        productoNombre: producto.nombre,
        libras: itemLibras,
        precioPorLibra,
      },
    ]);

    setItemLibras('');
    setItemPrice(String(Number(producto.precioPorLibra).toFixed(2)));
  }

  function updateCartItem(id: string, patch: Partial<CartItem>) {
    setCart((current) => current.map((item) => (item.id === id ? ({ ...item, ...patch } as CartItem) : item)));
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
      await fetch('/api/sale-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          clientId: selectedClientId,
          items: cart.map((item) =>
            item.mode === 'oro'
              ? {
                  productoId: item.productoId,
                  libras: Number(item.libras),
                  porcentajeOro: Number(item.porcentajeOro),
                  precioPorQuintalOro: Number(item.precioPorQuintalOro),
                }
              : {
                  productoId: item.productoId,
                  libras: Number(item.libras),
                  precioPorLibra: Number(item.precioPorLibra),
                },
          ),
        }),
      }).then(parseApiResponse);

      setCart([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando venta por cliente');
    } finally {
      setLoading(false);
    }
  }

  async function printTicket(transaction: SaleTransactionDTO) {
    try {
      setError(null);
      setPrintingId(transaction.id);

      if (rawbtEnabled) {
        const { payloadB64 } = await fetch(`/api/print/ticket/data?transactionId=${transaction.id}&kind=sale`, {
          cache: 'no-store',
        }).then(parseApiResponse<{ payloadB64: string }>);
        window.location.href = `rawbt:base64,${payloadB64}`;
        return;
      }

      const { jobId } = await fetch('/api/print/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id, kind: 'sale' }),
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
      await fetch(`/api/sale-transactions/${id}`, { method: 'DELETE' }).then(parseApiResponse);
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
        <h1>Ventas por cliente</h1>
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
        <article className="card half kpi">
          <div className="label">Saldo actual</div>
          <div className="value">L {ledger?.totals.saldoActual.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Ventas del día</div>
          <div className="value">L {ledger?.totals.totalVentas.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Transacciones</div>
          <div className="value"> {transactions.length}</div>
        </article>

        <article className="card third kpi">
          <div className="label">Productos activos</div>
          <div className="value"> {productos.length}</div>
        </article>

        <article className="card half">
          <h3>Cliente</h3>
          <label style={{ marginTop: 8 }}>
            Cliente para la venta
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

          {productoGroups.map((group) => (
            <div key={group.label} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                {group.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                {group.items.map((producto) => {
                  const selected = itemProductoId === producto.id;
                  return (
                    <button
                      key={producto.id}
                      type="button"
                      onClick={() => {
                        setItemProductoId(producto.id);
                        setItemPrice(String(Number(producto.precioPorLibra).toFixed(2)));
                        setItemPrecioPorQuintalOro('');
                        setItemPorcentajeOro(
                          isCafeCategoria(producto) && producto.factorConversionOro !== null && producto.factorConversionOro !== undefined
                            ? String(Number(producto.factorConversionOro) * 100)
                            : '',
                        );
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
            </div>
          ))}

          <form onSubmit={(event) => void addItemToCart(event)} className="row" style={{ marginTop: 14 }}>
            {isOroMode ? (
              <>
                <label className="stack-on-tablet" style={{ gridColumn: 'span 4' }}>
                  Libras
                  <input value={itemLibras} onChange={(event) => setItemLibras(event.target.value)} type="number" step="0.01" required />
                </label>
                <label className="stack-on-tablet" style={{ gridColumn: 'span 4' }}>
                  % Oro
                  <input value={itemPorcentajeOro} onChange={(event) => setItemPorcentajeOro(event.target.value)} type="number" step="0.01" required />
                </label>
                <label className="stack-on-tablet" style={{ gridColumn: 'span 4' }}>
                  Precio por quintal Oro
                  <input
                    value={itemPrecioPorQuintalOro}
                    onChange={(event) => setItemPrecioPorQuintalOro(event.target.value)}
                    type="number"
                    step="0.01"
                    required
                  />
                </label>
                {(() => {
                  const preview = computeOroDerived({
                    libras: itemLibras,
                    porcentajeOro: itemPorcentajeOro,
                    precioPorQuintalOro: itemPrecioPorQuintalOro,
                  });
                  return (
                    <div style={{ gridColumn: 'span 12', display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-soft)' }}>
                      <span>
                        Quintales vendidos: <strong style={{ color: 'var(--text-main)' }}>{preview.quintalesVendidas.toFixed(2)}</strong>
                      </span>
                      <span>
                        Quintales Oro: <strong style={{ color: 'var(--text-main)' }}>{preview.quintalesOro.toFixed(2)}</strong>
                      </span>
                      <span>
                        Total: <strong style={{ color: 'var(--text-main)' }}>L {preview.total.toFixed(2)}</strong>
                      </span>
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <label style={{ gridColumn: 'span 6' }}>
                  Libras
                  <input value={itemLibras} onChange={(event) => setItemLibras(event.target.value)} type="number" step="0.01" required />
                </label>
                <label style={{ gridColumn: 'span 6' }}>
                  Precio por libra
                  <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} type="number" step="0.01" required />
                </label>
              </>
            )}
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={!itemProductoId}>
                Agregar al carrito
              </button>
            </div>
          </form>
        </article>

        <article className="card wide">
          <h3>Carrito de venta</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {cart.length === 0 ? (
              <p style={{ color: 'var(--text-soft)', margin: 0 }}>Aún no agregaste items al carrito.</p>
            ) : (
              cart.map((item) => {
                if (item.mode === 'oro') {
                  const derived = computeOroDerived(item);
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
                          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Libras</span>
                          <input
                            value={item.libras}
                            onChange={(event) => updateCartItem(item.id, { libras: event.target.value })}
                            type="number"
                            step="0.01"
                          />
                        </label>
                        <label style={{ flex: '1 1 80px' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>% Oro</span>
                          <input
                            value={item.porcentajeOro}
                            onChange={(event) => updateCartItem(item.id, { porcentajeOro: event.target.value })}
                            type="number"
                            step="0.01"
                          />
                        </label>
                        <label style={{ flex: '1 1 100px' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Precio / qq oro</span>
                          <input
                            value={item.precioPorQuintalOro}
                            onChange={(event) => updateCartItem(item.id, { precioPorQuintalOro: event.target.value })}
                            type="number"
                            step="0.01"
                          />
                        </label>
                        <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Qq oro</div>
                          <strong>{derived.quintalesOro.toFixed(2)}</strong>
                        </div>
                        <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Subtotal</div>
                          <strong>L {derived.total.toFixed(2)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                }

                const subtotal = decimalOrZero(item.libras) * decimalOrZero(item.precioPorLibra);
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
                      <label style={{ flex: '1 1 100px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Libras</span>
                        <input
                          value={item.libras}
                          onChange={(event) => updateCartItem(item.id, { libras: event.target.value })}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <label style={{ flex: '1 1 100px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Precio / libra</span>
                        <input
                          value={item.precioPorLibra}
                          onChange={(event) => updateCartItem(item.id, { precioPorLibra: event.target.value })}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Subtotal</div>
                        <strong>L {subtotal.toFixed(2)}</strong>
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
              Guardar venta por cliente
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
                      <th>Libras</th>
                      <th>Precio</th>
                      <th>% Oro / Qq oro</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productoNombre}</td>
                        <td>{(item.libras ?? 0).toFixed(2)}</td>
                        <td>
                          {item.precioPorQuintalOro != null
                            ? `L ${item.precioPorQuintalOro.toFixed(2)}/qq oro`
                            : `L ${(item.precioPorLibra ?? 0).toFixed(2)}/lb`}
                        </td>
                        <td>
                          {item.porcentajeOro != null && item.quintalesOro != null
                            ? `${item.porcentajeOro.toFixed(2)}% · ${item.quintalesOro.toFixed(2)} qq`
                            : '—'}
                        </td>
                        <td>L {item.monto.toFixed(2)}</td>
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
