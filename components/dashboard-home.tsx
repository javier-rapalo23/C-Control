'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApiResponse } from '@/types/api';
import type { LedgerDTO } from '@/types/domain';

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
      <section className="hero">
        <h1>Control Diario — Resumen</h1>
        <p>Resumen rápido del día y accesos a los módulos de Compras, Ventas y Gastos.</p>
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
          <div className="value">$ {ledger?.totals.saldoActual.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Ventas del día</div>
          <div className="value">$ {ledger?.totals.totalVentas.toFixed(2) ?? '0.00'}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Movimientos</div>
          <div className="value">{ledger ? ledger.purchases.length + ledger.sales.length + ledger.expenses.length : 0}</div>
        </article>

        <article className="card wide">
          <h3>Módulos</h3>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <Link href="/purchases">
              <button className="btn-primary">Ir a Compras</button>
            </Link>
            <Link href="/sales">
              <button className="btn-primary">Ir a Ventas</button>
            </Link>
            <Link href="/expenses">
              <button className="btn-primary">Reportar Gastos</button>
            </Link>
          </div>
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
