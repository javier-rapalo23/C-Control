'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { LedgerDTO, MaterialDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchasesPanel() {
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [purchaseMaterialId, setPurchaseMaterialId] = useState('');
  const [purchaseLibras, setPurchaseLibras] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');

  const fetchMaterials = useCallback(async () => {
    const res = await fetch('/api/materials', { cache: 'no-store' });
    const data = await parseApiResponse<MaterialDTO[]>(res);
    setMaterials(data);
    if (!purchaseMaterialId && data.length > 0) setPurchaseMaterialId(data[0].id);
  }, [purchaseMaterialId]);

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

  useEffect(() => {
    void Promise.all([fetchMaterials(), fetchLedger()]);
  }, [fetchMaterials, fetchLedger]);

  async function createPurchase(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          materialId: purchaseMaterialId,
          libras: Number(purchaseLibras),
          precioPorLibra: purchasePrice ? Number(purchasePrice) : undefined,
        }),
      }).then(parseApiResponse);
      setPurchaseLibras('');
      setPurchasePrice('');
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando compra');
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string) {
    try {
      setLoading(true);
      await fetch(`/api/purchases/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando compra');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <h1>Compras</h1>
      <p>Registrar y listar compras del día seleccionado.</p>

      <section className="card" style={{ marginTop: 12 }}>
        <form onSubmit={(e) => void createPurchase(e)} className="row">
          <label style={{ gridColumn: 'span 4' }}>
            Fecha
            <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Material
            <select value={purchaseMaterialId} onChange={(e) => setPurchaseMaterialId(e.target.value)} required>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} (${m.precioPorLibra.toFixed(2)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            Libras
            <input value={purchaseLibras} onChange={(e) => setPurchaseLibras(e.target.value)} type="number" step="0.01" required />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            Precio manual
            <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} type="number" step="0.01" placeholder="Opcional" />
          </label>
          <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
            <button className="btn-primary" type="submit">
              Registrar compra
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Compras del día</h3>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Material</th>
              <th>Libras</th>
              <th>Total</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {ledger?.purchases.map((item) => (
              <tr key={item.id}>
                <td>{item.materialNombre}</td>
                <td>{item.libras.toFixed(2)}</td>
                <td>$ {item.total.toFixed(2)}</td>
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

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Sincronizando...</p> : null}
    </main>
  );
}
