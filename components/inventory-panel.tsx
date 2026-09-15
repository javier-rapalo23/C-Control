'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { ProductoDTO, ProductoStockDTO } from '@/types/domain';
import { COFFEE_TYPES, PRODUCTO_CATEGORIA_LABELS, type ProductoCategoria } from '@/lib/coffee-types';
import { useSucursal } from '@/lib/use-sucursal';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

type ProductoStock = {
  producto: ProductoDTO;
  stock: ProductoStockDTO | null;
};

export default function InventoryPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [productos, setProductos] = useState<ProductoDTO[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, ProductoStock>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Productos CRUD state
  const [productosError, setProductosError] = useState<string | null>(null);
  // Ni precio ni factor oro: los dos se capturan por línea en Compras y Ventas.
  // La categoría tampoco se edita — la fija el catálogo de `lib/coffee-types.ts`
  // a partir del nombre del tipo.
  const [editingProducto, setEditingProducto] = useState<{
    id: string;
    nombre: string;
    taraPorSaco: string;
  } | null>(null);
  const [newProdNombre, setNewProdNombre] = useState('');
  const [newProdTaraPorSaco, setNewProdTaraPorSaco] = useState('');

  const fetchAll = useCallback(async () => {
    if (!sucursalId) return;
    setLoading(true);
    setError(null);
    try {
      const prodsResponse = await fetch('/api/productos', { cache: 'no-store' });
      const prods = await parseApiResponse<ProductoDTO[]>(prodsResponse);
      setProductos(prods);

      // Fetch stock for each producto in parallel, scoped a la sucursal seleccionada
      type StockApiData = { filters: unknown; data: ProductoStockDTO };

      const stockResults = await Promise.all(
        prods.map(async (prod) => {
          const stockRes = await fetch(`/api/productos/stock?productoId=${prod.id}&sucursalId=${sucursalId}`, {
            cache: 'no-store',
          });
          const stockBody = (await stockRes.json()) as { ok: boolean; data?: StockApiData };
          const stock = stockBody.ok && stockBody.data ? stockBody.data.data : null;

          return { prod, stock };
        }),
      );

      const newStockMap: Record<string, ProductoStock> = {};
      for (const { prod, stock } of stockResults) {
        newStockMap[prod.id] = { producto: prod, stock };
      }

      setStockMap(newStockMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando inventario');
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Solo se ofrecen los tipos del catálogo que todavía no tienen fila. Crear uno
  // repetido chocaría contra el índice único de `Producto.nombre`, y el error de
  // base de datos no le dice nada a quien está en el mostrador.
  const tiposDisponibles = useMemo(() => {
    const activos = new Set(productos.map((producto) => producto.nombre.toLowerCase()));
    return COFFEE_TYPES.filter((tipo) => !activos.has(tipo.nombre.toLowerCase()));
  }, [productos]);

  async function createProducto(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setProductosError(null);
      await fetch('/api/productos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: newProdNombre,
          taraPorSaco: newProdTaraPorSaco ? Number(newProdTaraPorSaco) : undefined,
        }),
      }).then(parseApiResponse);
      setNewProdNombre('');
      setNewProdTaraPorSaco('');
      await fetchAll();
    } catch (err) {
      setProductosError(err instanceof Error ? err.message : 'Error creando producto');
      setLoading(false);
    }
  }

  async function updateProducto(id: string) {
    if (!editingProducto) return;
    try {
      setLoading(true);
      setProductosError(null);
      await fetch(`/api/productos/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: editingProducto.nombre,
          taraPorSaco: editingProducto.taraPorSaco ? Number(editingProducto.taraPorSaco) : undefined,
        }),
      }).then(parseApiResponse);
      setEditingProducto(null);
      await fetchAll();
    } catch (err) {
      setProductosError(err instanceof Error ? err.message : 'Error actualizando producto');
      setLoading(false);
    }
  }

  async function deleteProducto(id: string) {
    try {
      setLoading(true);
      setProductosError(null);
      await fetch(`/api/productos/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setProductosError(err instanceof Error ? err.message : 'Error eliminando producto');
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Inventario</h1>
        <p>Productos y stock actual por producto.</p>
      </section>

      <section className="card-grid">
        <article className="card wide">
          <label style={{ maxWidth: 320 }}>
            Sucursal
            <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          {error ? <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p> : null}
        </article>

        {/* Productos */}
        <article className="card wide">
          <h3>Tipos de café</h3>
          <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: -4 }}>
            El catálogo es fijo. El precio y el rendimiento no viven aquí: cambian por cliente y por
            día, y se escriben a mano en cada línea de Compras y Ventas.
          </p>
          {productosError ? <p style={{ color: 'var(--danger)' }}>{productosError}</p> : null}

          <table className="table-like">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Facturación</th>
                <th>Tara / saco</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((m) =>
                editingProducto?.id === m.id ? (
                  <tr key={m.id}>
                    <td>
                      <select
                        value={editingProducto.nombre}
                        onChange={(e) => setEditingProducto((prev) => prev && { ...prev, nombre: e.target.value })}
                      >
                        {COFFEE_TYPES.map((tipo) => (
                          <option key={tipo.nombre} value={tipo.nombre}>
                            {tipo.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td colSpan={2} style={{ color: 'var(--text-soft)' }}>
                      Se ajusta sola al tipo elegido
                    </td>
                    <td>
                      <input
                        value={editingProducto.taraPorSaco}
                        onChange={(e) => setEditingProducto((prev) => prev && { ...prev, taraPorSaco: e.target.value })}
                        type="number"
                        step="0.01"
                        placeholder="lb/saco"
                      />
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-primary" type="button" onClick={() => void updateProducto(m.id)}>
                        Guardar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => setEditingProducto(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id}>
                    <td>{m.nombre}</td>
                    <td>{m.categoria ? PRODUCTO_CATEGORIA_LABELS[m.categoria as ProductoCategoria] : '—'}</td>
                    <td>{m.facturable ? 'Se factura' : 'No se factura'}</td>
                    <td>{m.taraPorSaco !== null && m.taraPorSaco !== undefined ? `${m.taraPorSaco.toFixed(2)} lb` : '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-primary"
                        type="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() =>
                          setEditingProducto({
                            id: m.id,
                            nombre: m.nombre,
                            taraPorSaco: m.taraPorSaco !== null && m.taraPorSaco !== undefined ? String(m.taraPorSaco) : '',
                          })
                        }
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Editar
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => void deleteProducto(m.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {productos.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5}>No hay tipos de café registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {tiposDisponibles.length > 0 ? (
            <>
              <h4 style={{ marginTop: 16 }}>Activar un tipo</h4>
              <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: -4 }}>
                Solo aparecen los tipos del catálogo que todavía no están activos. La tara por saco
                es opcional y sirve para descontar el peso de los sacos en Compras.
              </p>
              <form onSubmit={(e) => void createProducto(e)} className="row" style={{ marginTop: 8 }}>
                <label className="stack-on-tablet" style={{ gridColumn: 'span 6' }}>
                  Tipo de café
                  <select value={newProdNombre} onChange={(e) => setNewProdNombre(e.target.value)} required>
                    <option value="">Elegir tipo…</option>
                    {tiposDisponibles.map((tipo) => (
                      <option key={tipo.nombre} value={tipo.nombre}>
                        {tipo.nombre} — {PRODUCTO_CATEGORIA_LABELS[tipo.categoria]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack-on-tablet" style={{ gridColumn: 'span 6' }}>
                  Tara / saco (lb)
                  <input value={newProdTaraPorSaco} onChange={(e) => setNewProdTaraPorSaco(e.target.value)} type="number" step="0.01" />
                </label>
                <div style={{ gridColumn: 'span 12', marginTop: 4 }}>
                  <button className="btn-primary" type="submit" disabled={loading || !newProdNombre}>
                    Agregar
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 16 }}>
              Los ocho tipos del catálogo ya están activos.
            </p>
          )}
        </article>

        {/* Stock cards por producto */}
        {productos.map((prod) => {
          const entry = stockMap[prod.id];
          const totalLibras = entry?.stock?.totalLibras ?? 0;

          return (
            <article key={prod.id} className="card third kpi">
              <div className="label">{prod.nombre}</div>
              <div className="value">{totalLibras.toFixed(2)} lb</div>
            </article>
          );
        })}
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
