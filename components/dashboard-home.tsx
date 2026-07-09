'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CompanySettingsDTO, LedgerDTO, MaterialDTO } from '@/types/domain';
import { useRoleGuard } from '@/lib/use-role-guard';
import rControlLogo from '../R-CONTROL.png';

type DailyStockEntry = { businessDate: string; libras: number };
type MaterialStockSummary = { materialId: string; materialNombre: string; totalLibras: number };
type StockResult = {
  data?: {
    materialId?: string;
    totalLibras?: number;
    daily?: DailyStockEntry[];
    materials?: MaterialStockSummary[];
  };
};

type ImportApiData = {
  imported: {
    importedDays: number;
    importedMaterials: number;
    importedPurchases: number;
    importedSales: number;
    importedExpenses: number;
  };
};

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

export default function DashboardHome() {
  const roleGuardStatus = useRoleGuard((role) => role !== 'comprador', '/purchases');
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importUserId, setImportUserId] = useState('admin');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [materialQuery, setMaterialQuery] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('2026-05-25');
  const [toDate, setToDate] = useState<string>(todayDateString());
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockResult, setStockResult] = useState<StockResult | null>(null);
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [rawbtEnabled, setRawbtEnabled] = useState(false);
  const [printingSummary, setPrintingSummary] = useState(false);

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
    void fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    setRawbtEnabled(localStorage.getItem(RAWBT_STORAGE_KEY) === 'true');
  }, []);

  function toggleRawbt(value: boolean) {
    setRawbtEnabled(value);
    localStorage.setItem(RAWBT_STORAGE_KEY, value ? 'true' : 'false');
  }

  async function printSummary() {
    try {
      setError(null);
      setPrintingSummary(true);

      if (rawbtEnabled) {
        const { payloadB64 } = await fetch(`/api/print/summary/data?businessDate=${businessDate}`, {
          cache: 'no-store',
        }).then(parseApiResponse<{ payloadB64: string }>);
        window.location.href = `rawbt:base64,${payloadB64}`;
        return;
      }

      const { jobId } = await fetch('/api/print/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate }),
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
        setError(jobError || 'Error imprimiendo resumen');
      } else if (status !== 'done') {
        setError('La impresora no respondió a tiempo. Verifica que esté encendida y conectada a la red.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error imprimiendo resumen');
    } finally {
      setPrintingSummary(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/settings/company', { cache: 'no-store' });
        const data = await parseApiResponse<CompanySettingsDTO>(res);
        if (mounted && data.nombre) setCompanyName(data.nombre);
      } catch {
        // ignore errors fetching company name
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMaterialsLoading(true);
        const res = await fetch('/api/materials', { cache: 'no-store' });
        const list = await parseApiResponse<MaterialDTO[]>(res);
        if (mounted) setMaterials(list);
      } catch {
        // ignore errors fetching materials for the select
      } finally {
        if (mounted) setMaterialsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const BarList = ({ items }: { items: { key: string; label: string; value: number }[] }) => {
    if (!items || items.length === 0) return null;
    const max = Math.max(...items.map((i) => i.value), 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {items.map((item) => {
          const pct = max > 0 ? (item.value / max) * 100 : 0;
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 130, textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', flexShrink: 0 }}>
                {item.label}
              </div>
              <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: 4, height: 22 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    background: 'var(--primary, #2563eb)',
                    borderRadius: 4,
                    height: '100%',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div style={{ width: 100, fontSize: 13, flexShrink: 0 }}>
                {item.value.toLocaleString('es-HN')} lb
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const dailyPurchasesSummary = (() => {
    if (!ledger) return [];
    const byMaterial: Record<string, { materialNombre: string; libras: number; total: number }> = {};
    for (const p of ledger.purchases) {
      if (!byMaterial[p.materialId]) byMaterial[p.materialId] = { materialNombre: p.materialNombre, libras: 0, total: 0 };
      byMaterial[p.materialId].libras += p.libras;
      byMaterial[p.materialId].total += p.total;
    }
    return Object.values(byMaterial).sort((a, b) => b.total - a.total);
  })();

  async function importData(event: React.FormEvent) {
    event.preventDefault();

    if (!importFile) {
      setImportError('Selecciona un archivo .txt o .json para importar.');
      setImportSuccess(null);
      return;
    }

    if (!importUserId.trim()) {
      setImportError('Ingresa el usuario autorizado para importar.');
      setImportSuccess(null);
      return;
    }

    try {
      setImporting(true);
      setImportError(null);
      setImportSuccess(null);

      const raw = await importFile.text();
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-user-id': importUserId.trim(),
        },
        body: raw,
      });

      const data = await parseApiResponse<ImportApiData>(response);
      setImportSuccess(
        `Importación lista: ${data.imported.importedDays} días, ${data.imported.importedPurchases} compras, ${data.imported.importedSales} ventas, ${data.imported.importedExpenses} gastos.`,
      );
      setImportFile(null);
      await fetchLedger();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No fue posible importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero hero--brand">
        <Image src={rControlLogo} width={132} height={132} className="hero-logo" alt="R Control" priority />
        <div>
          <h1>Control Diario — Resumen</h1>
          {companyName ? <h2 style={{ fontWeight: 600, marginBottom: 2 }}>{companyName}</h2> : null}
          <p>Resumen rápido del día y accesos a los módulos de Compras, Ventas y Gastos.</p>
        </div>
      </section>

      <section className="card-grid">
        <article className="card wide">
          <div className="row">
            <label style={{ gridColumn: 'span 4' }}>
              Fecha de negocio
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
              <button className="btn-primary" onClick={() => void fetchLedger()}>
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
          <div className="label">Movimientos</div>
          <div className="value"> {ledger ? ledger.purchases.length + ledger.sales.length + ledger.expenses.length : 0}</div>
        </article>

        <article className="card wide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3>Resumen de compras del día</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-soft)' }}>
                <input type="checkbox" checked={rawbtEnabled} onChange={(e) => toggleRawbt(e.target.checked)} />
                Imprimir con RawBT en este dispositivo
              </label>
              <button className="btn-primary" type="button" disabled={printingSummary} onClick={() => void printSummary()}>
                {printingSummary ? 'Imprimiendo...' : 'Imprimir resumen del día'}
              </button>
            </div>
          </div>
          <table className="table-like" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Material</th>
                <th>Libras</th>
                <th>Total (L)</th>
              </tr>
            </thead>
            <tbody>
              {dailyPurchasesSummary.map((item) => (
                <tr key={item.materialNombre}>
                  <td>{item.materialNombre}</td>
                  <td>{item.libras.toLocaleString('es-HN')} lb</td>
                  <td>L {item.total.toFixed(2)}</td>
                </tr>
              ))}
              {dailyPurchasesSummary.length === 0 ? (
                <tr>
                  <td colSpan={3}>No hay compras registradas para este día.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>

        <article className="card wide">
          <h3>Consultar stock por material</h3>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 3' }}>
              Material
              <select value={materialQuery} onChange={(e) => setMaterialQuery(e.target.value)}>
                <option value="">-- Todos --</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              {materialsLoading ? <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Cargando materiales...</div> : null}
            </label>
            <label style={{ gridColumn: 'span 3' }}>
              Desde
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label style={{ gridColumn: 'span 3' }}>
              Hasta
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <div style={{ gridColumn: 'span 3', alignSelf: 'end' }}>
              <button
                className="btn-primary"
                type="button"
                disabled={stockLoading}
                onClick={async () => {
                  try {
                    setStockLoading(true);
                    setStockError(null);
                    setStockResult(null);
                    const qs = new URLSearchParams();
                    if (materialQuery.trim()) qs.set('materialId', materialQuery.trim());
                    if (fromDate) qs.set('from', fromDate);
                    if (toDate) qs.set('to', toDate);
                    const res = await fetch(`/api/materials/stock?${qs.toString()}`, { cache: 'no-store' });
                    const body = await parseApiResponse<StockResult>(res);
                    setStockResult(body);
                  } catch (err) {
                    setStockError(err instanceof Error ? err.message : 'Error consultando stock');
                  } finally {
                    setStockLoading(false);
                  }
                }}
              >
                {stockLoading ? 'Consultando...' : 'Consultar'}
              </button>
            </div>
          </div>

          {stockError ? <p style={{ color: 'var(--danger)' }}>{stockError}</p> : null}
          {stockResult ? (
            <div style={{ marginTop: 12 }}>
              {stockResult.data?.materialId ? (
                <div>
                  <div><strong>Total libras:</strong> {stockResult.data.totalLibras ?? 0}</div>
                  <h4>Desglose diario</h4>
                  <BarList
                    items={(stockResult.data.daily ?? []).map((d: DailyStockEntry) => ({
                      key: d.businessDate,
                      label: d.businessDate,
                      value: Number(d.libras) || 0,
                    }))}
                  />
                </div>
              ) : (
                <div>
                  <h4>Totales por material</h4>
                  <BarList
                    items={(stockResult.data?.materials ?? []).map((m: MaterialStockSummary) => ({
                      key: m.materialId,
                      label: m.materialNombre,
                      value: Number(m.totalLibras) || 0,
                    }))}
                  />
                </div>
              )}
            </div>
          ) : null}
        </article>

        <article className="card wide">
          <h3>Importar TXT/JSON</h3>
          <form onSubmit={(event) => void importData(event)} className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 3' }}>
              Usuario (admin)
              <input
                value={importUserId}
                onChange={(event) => setImportUserId(event.target.value)}
                placeholder="admin"
                required
              />
            </label>
            <label style={{ gridColumn: 'span 7' }}>
              Archivo
              <input
                type="file"
                accept=".txt,.json,text/plain,application/json"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>
            <div style={{ gridColumn: 'span 2', alignSelf: 'end' }}>
              <button className="btn-primary" type="submit" disabled={importing}>
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </form>
          {importSuccess ? <p style={{ color: 'var(--ok)' }}>{importSuccess}</p> : null}
          {importError ? <p style={{ color: 'var(--danger)' }}>{importError}</p> : null}
        </article>
      </section>

      {loading ? <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>Cargando...</p> : null}
    </main>
  );
}
