'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApiResponse } from '@/types/api';
import type { LedgerDTO } from '@/types/domain';
import rControlLogo from '../R-CONTROL.png';

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
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardHome() {
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
  const [stockResult, setStockResult] = useState<any | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);

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
    let mounted = true;
    (async () => {
      try {
        setMaterialsLoading(true);
        const res = await fetch('/api/materials', { cache: 'no-store' });
        const data = await parseApiResponse<any>(res);
        const list = Array.isArray(data) ? data : data.materials ?? data.items ?? [];
        if (mounted) setMaterials(list);
      } catch (err) {
        // ignore errors fetching materials for the select
      } finally {
        if (mounted) setMaterialsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const MaterialBarChart = ({ items }: { items: any[] }) => {
    if (!items || items.length === 0) return null;
    const max = Math.max(...items.map((m) => Number(m.totalLibras) || 0), 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {items.map((m) => {
          const v = Number(m.totalLibras) || 0;
          const pct = max > 0 ? (v / max) * 100 : 0;
          return (
            <div key={m.materialId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 130, textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', flexShrink: 0 }}>
                {m.materialNombre}
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
                {v.toLocaleString('es-HN')} lb
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const DailyBarChart = ({ daily }: { daily: any[] }) => {
    if (!daily || daily.length === 0) return null;
    const nums = daily.map((d) => Number(d.libras) || 0);
    const max = Math.max(...nums, 0);
    const svgWidth = 600;
    const svgHeight = 120;
    const padding = 20;
    const gap = 6;
    const barWidth = (svgWidth - padding * 2 - gap * (daily.length - 1)) / daily.length;
    return (
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMinYMin meet">
          {daily.map((d, i) => {
            const v = Number(d.libras) || 0;
            const h = max > 0 ? (v / max) * (svgHeight - padding * 2) : 0;
            const x = padding + i * (barWidth + gap);
            const y = svgHeight - padding - h;
            return (
              <g key={d.businessDate}>
                <rect x={x} y={y} width={barWidth} height={h} fill="#2563eb" rx={3} />
                <text x={x + barWidth / 2} y={svgHeight - padding + 12} fontSize={10} fill="#111" textAnchor="middle">
                  {d.businessDate.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

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

  return (
    <main className="page-shell">
      <section className="hero hero--brand">
        <Image src={rControlLogo} width={132} height={132} className="hero-logo" alt="R Control" priority />
        <div>
          <h1>Control Diario — Resumen</h1>
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
          <div className="label">Ventas del día</div>
          <div className="value">L {ledger?.totals.totalVentas.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Movimientos</div>
          <div className="value"> {ledger ? ledger.purchases.length + ledger.sales.length + ledger.expenses.length : 0}</div>
        </article>

        

        <article className="card wide">
          <h3>Consultar stock por material</h3>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: 'span 3' }}>
              Material
              <select value={materialQuery} onChange={(e) => setMaterialQuery(e.target.value)}>
                <option value="">-- Todos --</option>
                {materials.map((m) => {
                  const id = m.id ?? m.materialId ?? m.material_id ?? String(m);
                  const nombre = m.nombre ?? m.materialNombre ?? m.name ?? m.material_nombre ?? id;
                  return (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  );
                })}
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
                    const body = await parseApiResponse<any>(res);
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
                  <DailyBarChart daily={stockResult.data.daily ?? []} />
                  <ul>
                    {stockResult.data.daily?.map((d: any) => (
                      <li key={d.businessDate}>{d.businessDate}: {d.libras}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <h4>Totales por material</h4>
                  <MaterialBarChart items={stockResult.data?.materials ?? []} />
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
