'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { ProductoCategoria, ProductoDTO, ProductoStockDTO } from '@/types/domain';
import { useModuleGuard } from '@/lib/use-module-guard';
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
  const roleGuardStatus = useModuleGuard('inventory');
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [productos, setProductos] = useState<ProductoDTO[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, ProductoStock>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Productos CRUD state
  const [productosError, setProductosError] = useState<string | null>(null);
  const [editingProducto, setEditingProducto] = useState<{
    id: string;
    nombre: string;
    categoria: ProductoCategoria | '';
    precioPorLibra: string;
    taraPorSaco: string;
    factorConversionOro: string;
  } | null>(null);
  const [newProdNombre, setNewProdNombre] = useState('');
  const [newProdCategoria, setNewProdCategoria] = useState<ProductoCategoria | ''>('');
  const [newProdPrecio, setNewProdPrecio] = useState('');
  const [newProdTaraPorSaco, setNewProdTaraPorSaco] = useState('');
  const [newProdFactorOro, setNewProdFactorOro] = useState('');

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
          categoria: newProdCategoria || undefined,
          precioPorLibra: Number(newProdPrecio),
          taraPorSaco: newProdTaraPorSaco ? Number(newProdTaraPorSaco) : undefined,
          factorConversionOro: newProdFactorOro ? Number(newProdFactorOro) : undefined,
        }),
      }).then(parseApiResponse);
      setNewProdNombre('');
      setNewProdCategoria('');
      setNewProdPrecio('');
      setNewProdTaraPorSaco('');
      setNewProdFactorOro('');
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
          categoria: editingProducto.categoria || null,
          precioPorLibra: Number(editingProducto.precioPorLibra),
          taraPorSaco: editingProducto.taraPorSaco ? Number(editingProducto.taraPorSaco) : undefined,
          factorConversionOro: editingProducto.factorConversionOro ? Number(editingProducto.factorConversionOro) : undefined,
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

  if (roleGuardStatus !== 'allowed') return null;

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
          <h3>Productos</h3>
          {productosError ? <p style={{ color: 'var(--danger)' }}>{productosError}</p> : null}

          <table className="table-like">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio / libra</th>
                <th>Tara / saco</th>
                <th>Factor oro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((m) =>
                editingProducto?.id === m.id ? (
                  <tr key={m.id}>
                    <td>
                      <input
                        value={editingProducto.nombre}
                        onChange={(e) => setEditingProducto((prev) => prev && { ...prev, nombre: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={editingProducto.categoria}
                        onChange={(e) =>
                          setEditingProducto((prev) => prev && { ...prev, categoria: e.target.value as ProductoCategoria | '' })
                        }
                      >
                        <option value="">Sin categoría</option>
                        <option value="uva">En Uva</option>
                        <option value="pergamino">En Pergamino</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={editingProducto.precioPorLibra}
                        onChange={(e) => setEditingProducto((prev) => prev && { ...prev, precioPorLibra: e.target.value })}
                        type="number"
                        step="0.01"
                      />
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
                    <td>
                      <input
                        value={editingProducto.factorConversionOro}
                        onChange={(e) => setEditingProducto((prev) => prev && { ...prev, factorConversionOro: e.target.value })}
                        type="number"
                        step="0.0001"
                        placeholder="ej. 0.8"
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
                    <td>{m.categoria === 'uva' ? 'En Uva' : m.categoria === 'pergamino' ? 'En Pergamino' : '—'}</td>
                    <td>L {Number(m.precioPorLibra).toFixed(2)}</td>
                    <td>{m.taraPorSaco !== null && m.taraPorSaco !== undefined ? `${m.taraPorSaco.toFixed(2)} lb` : '—'}</td>
                    <td>{m.factorConversionOro !== null && m.factorConversionOro !== undefined ? m.factorConversionOro.toFixed(4) : '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() =>
                          setEditingProducto({
                            id: m.id,
                            nombre: m.nombre,
                            categoria: m.categoria ?? '',
                            precioPorLibra: String(Number(m.precioPorLibra).toFixed(2)),
                            taraPorSaco: m.taraPorSaco !== null && m.taraPorSaco !== undefined ? String(m.taraPorSaco) : '',
                            factorConversionOro:
                              m.factorConversionOro !== null && m.factorConversionOro !== undefined ? String(m.factorConversionOro) : '',
                          })
                        }
                      >
                        Editar
                      </button>
                      <button className="btn-danger" type="button" onClick={() => void deleteProducto(m.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {productos.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6}>No hay productos registrados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Nuevo producto</h4>
          <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: -4 }}>
            Tara / saco y factor oro son opcionales: se usan para calcular peso neto y quintales oro en Compras.
          </p>
          <form onSubmit={(e) => void createProducto(e)} className="row" style={{ marginTop: 8 }}>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Nombre
              <input value={newProdNombre} onChange={(e) => setNewProdNombre(e.target.value)} required />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 2' }}>
              Categoría
              <select value={newProdCategoria} onChange={(e) => setNewProdCategoria(e.target.value as ProductoCategoria | '')}>
                <option value="">Sin categoría</option>
                <option value="uva">En Uva</option>
                <option value="pergamino">En Pergamino</option>
              </select>
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 2' }}>
              Precio por libra
              <input value={newProdPrecio} onChange={(e) => setNewProdPrecio(e.target.value)} type="number" step="0.01" required />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 3' }}>
              Tara / saco (lb)
              <input value={newProdTaraPorSaco} onChange={(e) => setNewProdTaraPorSaco(e.target.value)} type="number" step="0.01" />
            </label>
            <label className="stack-on-tablet" style={{ gridColumn: 'span 2' }}>
              Factor oro
              <input
                value={newProdFactorOro}
                onChange={(e) => setNewProdFactorOro(e.target.value)}
                type="number"
                step="0.0001"
                placeholder="ej. 0.8"
              />
            </label>
            <div style={{ gridColumn: 'span 12', marginTop: 4 }}>
              <button className="btn-primary" type="submit" disabled={loading}>
                Agregar
              </button>
            </div>
          </form>
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
