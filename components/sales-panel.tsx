'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { ClientDTO, LedgerDTO, ProductoDTO, SaleTransactionDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';
import { previewQuintalesOro } from '@/lib/oro-preview';
import ClientQuickCreateModal from '@/components/client-quick-create-modal';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';

type CartItem = {
  id: string;
  productoId: string;
  productoNombre: string;
  pesoBruto: string;
  numeroSacos: string;
  taraPorSaco: string;
  precioPorLibra: string;
  /** Rendimiento del lote en porcentaje; vacío si todavía no se conoce. */
  porcentajeOro: string;
};

/**
 * Previsualización del carrito, igual que en compras. El servidor recalcula
 * todo al guardar (`POST /api/sale-transactions`) y es el que manda.
 *
 * El monto es `(pesoBruto − tara × sacos) × precio`; los quintales oro son solo
 * una cifra de referencia.
 */
function computeDerived(item: { pesoBruto: string; numeroSacos: string; taraPorSaco: string; precioPorLibra: string; porcentajeOro: string }) {
  const pesoBruto = Number(item.pesoBruto) || 0;
  const numeroSacos = Number(item.numeroSacos) || 0;
  const taraPorSaco = Number(item.taraPorSaco) || 0;
  const precioPorLibra = Number(item.precioPorLibra) || 0;
  const pesoNeto = Math.max(0, pesoBruto - numeroSacos * taraPorSaco);
  const quintalesOro = previewQuintalesOro(pesoNeto, Number(item.porcentajeOro) || 0);
  const subtotal = pesoNeto * precioPorLibra;
  return { pesoNeto, quintalesOro, subtotal };
}

function taraDelProducto(producto: ProductoDTO | undefined) {
  return producto?.taraPorSaco !== null && producto?.taraPorSaco !== undefined ? String(producto.taraPorSaco) : '';
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

export default function SalesPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [productos, setProductos] = useState<ProductoDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [transactions, setTransactions] = useState<SaleTransactionDTO[]>([]);
  // Libras en stock por producto en la sucursal. `null` si no se pudo consultar.
  const [stockByProducto, setStockByProducto] = useState<Record<string, number | null>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientModalOpen, setClientModalOpen] = useState(false);

  const [itemProductoId, setItemProductoId] = useState('');
  const [itemPesoBruto, setItemPesoBruto] = useState('');
  const [itemNumeroSacos, setItemNumeroSacos] = useState('');
  const [itemTaraPorSaco, setItemTaraPorSaco] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemPorcentajeOro, setItemPorcentajeOro] = useState('');

  const fetchProductos = useCallback(async () => {
    const response = await fetch('/api/productos', { cache: 'no-store' });
    const data = await parseApiResponse<ProductoDTO[]>(response);
    setProductos(data);

    if (!itemProductoId && data.length > 0) {
      setItemProductoId(data[0].id);
      setItemTaraPorSaco(taraDelProducto(data[0]));
    }
    return data;
  }, [itemProductoId]);

  // Misma consulta que Inventario, para que las libras de la parrilla coincidan
  // con las que se ven allá.
  const fetchStock = useCallback(
    async (lista: ProductoDTO[]) => {
      const entries = await Promise.all(
        lista.map(async (producto) => {
          try {
            const response = await fetch(`/api/productos/stock?productoId=${producto.id}&sucursalId=${sucursalId}`, {
              cache: 'no-store',
            });
            const data = await parseApiResponse<{ data: { totalLibras: number } }>(response);
            return [producto.id, data.data.totalLibras] as const;
          } catch {
            return [producto.id, null] as const;
          }
        }),
      );
      setStockByProducto(Object.fromEntries(entries));
    },
    [sucursalId],
  );

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
      await Promise.all([fetchProductos().then(fetchStock), fetchClients(), fetchLedger(), fetchTransactions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sincronizando ventas');
    } finally {
      setLoading(false);
    }
  }, [fetchClients, fetchLedger, fetchProductos, fetchStock, fetchTransactions, sucursalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + computeDerived(item).subtotal, 0),
    [cart],
  );

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  // El cliente "general" agrupa ventas sueltas y no tiene estos datos; mostrar
  // una lista de guiones solo ocuparía espacio, así que se omite lo que está vacío.
  const selectedClientDatos = useMemo(() => {
    if (!selectedClient) return [];

    const nombreCompleto = [selectedClient.nombres, selectedClient.apellidos].filter(Boolean).join(' ');
    return [
      { label: 'Nombre completo', value: nombreCompleto || null },
      { label: 'Clave IHCAFE', value: selectedClient.claveIhcafe ?? null },
      { label: 'Finca', value: selectedClient.nombreFinca ?? null },
      { label: 'RTN', value: selectedClient.rtn ?? null },
      { label: 'Teléfono', value: selectedClient.telefono ?? null },
      { label: 'Cuenta bancaria', value: selectedClient.cuentaBancaria ?? null },
    ].filter((dato) => dato.value !== null && dato.value !== '');
  }, [selectedClient]);

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

    // El precio ya no sale del catálogo: si no se escribió, no hay de dónde sacarlo.
    if (!itemPrice || Number(itemPrice) <= 0) {
      setError('Escribe el precio por libra de esta venta');
      return;
    }

    const taraPorSaco = itemTaraPorSaco || String(producto.taraPorSaco ?? 0);

    if (computeDerived({ pesoBruto: itemPesoBruto, numeroSacos: itemNumeroSacos, taraPorSaco, precioPorLibra: itemPrice, porcentajeOro: '' }).pesoNeto <= 0) {
      setError('La tara no puede ser mayor o igual al peso bruto');
      return;
    }

    setError(null);
    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productoId: producto.id,
        productoNombre: producto.nombre,
        pesoBruto: itemPesoBruto,
        numeroSacos: itemNumeroSacos || '0',
        taraPorSaco,
        precioPorLibra: itemPrice,
        porcentajeOro: itemPorcentajeOro,
      },
    ]);

    // El precio y el rendimiento se conservan: dentro de una misma venta se repiten.
    setItemPesoBruto('');
    setItemNumeroSacos('');
    setItemTaraPorSaco(taraDelProducto(producto));
  }

  function updateCartItem(id: string, field: 'pesoBruto' | 'numeroSacos' | 'precioPorLibra' | 'porcentajeOro', value: string) {
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
      await fetch('/api/sale-transactions', {
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
            porcentajeOro: Number(item.porcentajeOro) > 0 ? Number(item.porcentajeOro) : undefined,
          })),
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
          <ErrorToast message={error} onClose={() => setError(null)} />
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

        <article className="card wide">
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

          {/* El nombre solo no basta para confirmar a quién se le vende: hay
              clientes homónimos, y lo que los distingue es la clave IHCAFE y el
              RTN. Verlos antes de guardar evita atribuirle la venta a otro. */}
          {selectedClientDatos.length > 0 ? (
            // `row` es la rejilla de 12 columnas del resto de formularios: cada dato
            // ocupa 6, así que quedan dos por fila y en móvil colapsa a una sola.
            <dl className="row" style={{ margin: '10px 0 0', fontSize: 13 }}>
              {selectedClientDatos.map((dato) => (
                <div key={dato.label} style={{ gridColumn: 'span 6' }}>
                  <dt style={{ color: 'var(--text-soft)' }}>{dato.label}</dt>
                  <dd style={{ margin: 0, fontWeight: 500 }}>{dato.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>

        <ClientQuickCreateModal
          open={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          onCreated={handleClientCreated}
        />

        <article className="card wide">
          <h3>Agregar item al carrito</h3>

          {/* Los ocho tipos salen en una sola parrilla, sin agrupar por categoría:
              son pocos y se buscan por nombre, no por si van en uva o en pergamino. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 10 }}>
            {productos.map((producto) => {
              const selected = itemProductoId === producto.id;
              const stock = stockByProducto[producto.id];
              return (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => {
                    // Solo la tara sale del producto: precio y rendimiento son del lote.
                    setItemProductoId(producto.id);
                    setItemTaraPorSaco(taraDelProducto(producto));
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
                    {producto.facturable ? 'Se factura' : 'No se factura'}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      marginTop: 4,
                      color: stock !== undefined && stock !== null && stock <= 0 ? 'var(--danger)' : 'inherit',
                    }}
                  >
                    {stock === undefined ? '…' : stock === null ? 'Stock: —' : `Stock: ${stock.toFixed(2)} lb`}
                  </div>
                </button>
              );
            })}
          </div>

          <form onSubmit={(event) => void addItemToCart(event)} className="row" style={{ marginTop: 14 }}>
            {/* Cuatro campos a 3 columnas cada uno, igual que en compras. La tara
                por saco se toma del producto; aquí solo se escribe cuántos sacos. */}
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Peso bruto (lb)
              <input value={itemPesoBruto} onChange={(event) => setItemPesoBruto(event.target.value)} type="number" step="0.01" required />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Tara
              <input value={itemNumeroSacos} onChange={(event) => setItemNumeroSacos(event.target.value)} type="number" step="1" min="0" />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Precio por libra
              <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} type="number" step="0.01" required />
            </label>
            {/* El rendimiento no bloquea la venta: sin él la línea se guarda sin
                quintales oro y el monto sale igual. */}
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Rendimiento (%)
              <input
                value={itemPorcentajeOro}
                onChange={(event) => setItemPorcentajeOro(event.target.value)}
                type="number"
                step="0.01"
                min="0"
                max="99.99"
              />
            </label>
            {(() => {
              const preview = computeDerived({
                pesoBruto: itemPesoBruto,
                numeroSacos: itemNumeroSacos,
                taraPorSaco: itemTaraPorSaco,
                precioPorLibra: itemPrice,
                porcentajeOro: itemPorcentajeOro,
              });
              return (
                <div style={{ gridColumn: 'span 12', display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-soft)' }}>
                  <span>
                    Peso neto: <strong style={{ color: 'var(--text-main)' }}>{preview.pesoNeto.toFixed(2)} lb</strong>
                  </span>
                  <span>
                    Quintales oro: <strong style={{ color: 'var(--text-main)' }}>{preview.quintalesOro > 0 ? preview.quintalesOro.toFixed(2) : '—'}</strong>
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
          <h3>Carrito de venta</h3>
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
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Precio / libra</span>
                        <input
                          value={item.precioPorLibra}
                          onChange={(event) => updateCartItem(item.id, 'precioPorLibra', event.target.value)}
                          type="number"
                          step="0.01"
                        />
                      </label>
                      <label style={{ flex: '1 1 80px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>Rend. %</span>
                        <input
                          value={item.porcentajeOro}
                          onChange={(event) => updateCartItem(item.id, 'porcentajeOro', event.target.value)}
                          type="number"
                          step="0.01"
                          min="0"
                          max="99.99"
                        />
                      </label>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Peso neto</div>
                        <strong>{derived.pesoNeto.toFixed(2)} lb</strong>
                      </div>
                      <div style={{ flex: '1 1 80px', alignSelf: 'flex-end', paddingBottom: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Qq oro</div>
                        <strong>{derived.quintalesOro > 0 ? derived.quintalesOro.toFixed(2) : '—'}</strong>
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
              Guardar venta por cliente
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
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={printingId === transaction.id}
                        onClick={() => void printTicket(transaction)}
                      >
                        {printingId === transaction.id ? 'Imprimiendo...' : 'Ticket'}
                      </button>
                      {/* Pestaña aparte: la factura A4 se imprime desde el diálogo del
                          navegador, no por el agente térmico. */}
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => window.open(`/print/venta/${transaction.id}`, '_blank', 'noopener')}
                      >
                        Factura A4
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
                      <th>Precio</th>
                      <th>Rend. / Qq oro</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productoNombre}</td>
                        {/* Las ventas anteriores al pesaje solo guardaron el neto. */}
                        <td>{item.pesoBruto != null ? item.pesoBruto.toFixed(2) : '—'}</td>
                        <td>{item.numeroSacos ?? '—'}</td>
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

      <LoadingOverlay active={loading} />
    </main>
  );
}
