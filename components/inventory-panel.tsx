'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { MaterialCargaDTO, MaterialDTO, MaterialStockDTO } from '@/types/domain';

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

type MaterialStock = {
  material: MaterialDTO;
  stock: MaterialStockDTO | null;
  ultimaCarga: MaterialCargaDTO | null;
};

export default function InventoryPanel() {
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, MaterialStock>>({});
  const [cargas, setCargas] = useState<MaterialCargaDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formMaterialId, setFormMaterialId] = useState('');
  const [formDate, setFormDate] = useState(todayDateString());
  const [formLibras, setFormLibras] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const matsResponse = await fetch('/api/materials', { cache: 'no-store' });
      const mats = await parseApiResponse<MaterialDTO[]>(matsResponse);
      setMaterials(mats);

      if (mats.length > 0 && !formMaterialId) {
        setFormMaterialId(mats[0].id);
      }

      // Fetch stock and cargas for each material in parallel
      type StockApiData = { filters: unknown; ultimaCarga: MaterialCargaDTO | null; data: MaterialStockDTO };

      const stockResults = await Promise.all(
        mats.map(async (mat) => {
          const [stockRes, cargasRes] = await Promise.all([
            fetch(`/api/materials/stock?materialId=${mat.id}`, { cache: 'no-store' }),
            fetch(`/api/material-cargas?materialId=${mat.id}`, { cache: 'no-store' }),
          ]);

          const stockBody = (await stockRes.json()) as { ok: boolean; data?: StockApiData };
          const cargasBody = (await cargasRes.json()) as { ok: boolean; data?: MaterialCargaDTO[] };

          const stock = stockBody.ok && stockBody.data ? stockBody.data.data : null;
          const ultimaCarga = stockBody.ok && stockBody.data ? stockBody.data.ultimaCarga : null;
          const matCargas = cargasBody.ok && cargasBody.data ? cargasBody.data : [];

          return { mat, stock, ultimaCarga, matCargas };
        }),
      );

      const newStockMap: Record<string, MaterialStock> = {};
      const allCargas: MaterialCargaDTO[] = [];

      for (const { mat, stock, ultimaCarga, matCargas } of stockResults) {
        newStockMap[mat.id] = { material: mat, stock, ultimaCarga };
        allCargas.push(...matCargas);
      }

      setStockMap(newStockMap);
      allCargas.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
      setCargas(allCargas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando inventario');
    } finally {
      setLoading(false);
    }
  }, [formMaterialId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function registrarCarga(event: React.FormEvent) {
    event.preventDefault();
    if (!formMaterialId) return;
    try {
      setLoading(true);
      setError(null);
      await fetch('/api/material-cargas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate: formDate,
          materialId: formMaterialId,
          libras: formLibras ? Number(formLibras) : null,
          descripcion: formDescripcion || null,
        }),
      }).then(parseApiResponse);

      setFormLibras('');
      setFormDescripcion('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando envío a venta');
      setLoading(false);
    }
  }

  async function eliminarCarga(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/material-cargas/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando carga');
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Inventario</h1>
        <p>Stock actual por material desde el último envío a venta. Registra cuándo mandas a vender un lote.</p>
      </section>

      <section className="card-grid">
        {error ? (
          <article className="card wide">
            <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          </article>
        ) : null}

        {/* Stock cards por material */}
        {materials.map((mat) => {
          const entry = stockMap[mat.id];
          const totalLibras = entry?.stock?.totalLibras ?? 0;
          const ultimaCarga = entry?.ultimaCarga ?? null;

          return (
            <article key={mat.id} className="card third kpi">
              <div className="label">{mat.nombre}</div>
              <div className="value">{totalLibras.toFixed(2)} lb</div>
              {ultimaCarga ? (
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  Último envío: {ultimaCarga.businessDate}
                  {ultimaCarga.libras !== null ? ` · ${ultimaCarga.libras.toFixed(2)} lb` : ''}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>Sin envíos registrados</div>
              )}
            </article>
          );
        })}

        {/* Formulario registrar envío a venta */}
        <article className="card half">
          <h3>Registrar envío a venta</h3>
          <form onSubmit={(event) => void registrarCarga(event)} className="row" style={{ marginTop: 10 }}>
            <label style={{ gridColumn: 'span 12' }}>
              Material
              <select value={formMaterialId} onChange={(event) => setFormMaterialId(event.target.value)} required>
                {materials.map((mat) => (
                  <option key={mat.id} value={mat.id}>
                    {mat.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Fecha de envío
              <input type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} required />
            </label>
            <label style={{ gridColumn: 'span 6' }}>
              Libras enviadas
              <input
                type="number"
                step="0.01"
                placeholder="Opcional"
                value={formLibras}
                onChange={(event) => setFormLibras(event.target.value)}
              />
            </label>
            <label style={{ gridColumn: 'span 12' }}>
              Descripción
              <input
                placeholder="Opcional (ej: enviado a Fundidora XYZ)"
                value={formDescripcion}
                onChange={(event) => setFormDescripcion(event.target.value)}
              />
            </label>
            <div style={{ gridColumn: 'span 12' }}>
              <button className="btn-primary" type="submit" disabled={loading || !formMaterialId}>
                Registrar envío
              </button>
            </div>
          </form>
        </article>

        {/* Historial de cargas */}
        <article className="card wide">
          <h3>Historial de envíos a venta</h3>
          {cargas.length === 0 ? (
            <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>No hay envíos registrados aún.</p>
          ) : (
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Material</th>
                  <th>Libras</th>
                  <th>Descripción</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((carga) => (
                  <tr key={carga.id}>
                    <td>{carga.businessDate}</td>
                    <td>{carga.materialNombre}</td>
                    <td>{carga.libras !== null ? `${carga.libras.toFixed(2)} lb` : '—'}</td>
                    <td>{carga.descripcion ?? '—'}</td>
                    <td>
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => void eliminarCarga(carga.id)}
                        disabled={loading}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
