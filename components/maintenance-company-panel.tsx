'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CompanySettingsDTO } from '@/types/domain';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

export default function MaintenanceCompanyPanel() {
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [companyForm, setCompanyForm] = useState({
    nombre: '',
    rtn: '',
    telefono: '',
    direccion: '',
    email: '',
    printerIp: '',
    printerPort: '9100',
  });
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState(false);

  const fetchCompany = useCallback(async () => {
    try {
      setCompanyLoading(true);
      const res = await fetch('/api/settings/company', { cache: 'no-store' });
      const data = await parseApiResponse<CompanySettingsDTO>(res);
      setCompany(data);
      setCompanyForm({
        nombre: data.nombre,
        rtn: data.rtn,
        telefono: data.telefono,
        direccion: data.direccion,
        email: data.email,
        printerIp: data.printerIp,
        printerPort: String(data.printerPort || 9100),
      });
      setCompanyError(null);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Error cargando empresa');
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompany();
  }, [fetchCompany]);

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    try {
      setCompanyLoading(true);
      setCompanyError(null);
      setCompanySuccess(false);
      const res = await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...companyForm,
          printerPort: companyForm.printerPort ? Number(companyForm.printerPort) : undefined,
        }),
      });
      const data = await parseApiResponse<CompanySettingsDTO>(res);
      setCompany(data);
      setCompanySuccess(true);
      setTimeout(() => setCompanySuccess(false), 3000);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'Error guardando empresa');
    } finally {
      setCompanyLoading(false);
    }
  }

  return (
    <section className="card">
      <h3>Datos de la empresa</h3>
      <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 12 }}>
        Se usan en tickets, recibos y facturas.
      </p>
      {companyError ? <p style={{ color: 'var(--danger)' }}>{companyError}</p> : null}
      {companySuccess ? <p style={{ color: 'var(--ok, green)' }}>Guardado correctamente.</p> : null}
      <form onSubmit={(e) => void saveCompany(e)} className="row">
        <label style={{ gridColumn: 'span 12' }}>
          Nombre de la empresa
          <input value={companyForm.nombre} onChange={(e) => setCompanyForm((f) => ({ ...f, nombre: e.target.value }))} />
        </label>
        <label style={{ gridColumn: 'span 6' }}>
          RTN
          <input value={companyForm.rtn} onChange={(e) => setCompanyForm((f) => ({ ...f, rtn: e.target.value }))} placeholder="1234-1234-123456" />
        </label>
        <label style={{ gridColumn: 'span 6' }}>
          Teléfono
          <input value={companyForm.telefono} onChange={(e) => setCompanyForm((f) => ({ ...f, telefono: e.target.value }))} />
        </label>
        <label style={{ gridColumn: 'span 12' }}>
          Dirección
          <input value={companyForm.direccion} onChange={(e) => setCompanyForm((f) => ({ ...f, direccion: e.target.value }))} />
        </label>
        <label style={{ gridColumn: 'span 12' }}>
          Correo electrónico
          <input value={companyForm.email} onChange={(e) => setCompanyForm((f) => ({ ...f, email: e.target.value }))} type="email" />
        </label>

        <div style={{ gridColumn: 'span 12', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 4px' }}>Impresora térmica</h4>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, margin: '0 0 12px' }}>
            Los tickets se envían directamente a esta impresora de red (sin vista previa).
          </p>
        </div>
        <label style={{ gridColumn: 'span 8' }}>
          IP de la impresora
          <input
            value={companyForm.printerIp}
            onChange={(e) => setCompanyForm((f) => ({ ...f, printerIp: e.target.value }))}
            placeholder="192.168.101.98"
          />
        </label>
        <label style={{ gridColumn: 'span 4' }}>
          Puerto
          <input
            value={companyForm.printerPort}
            onChange={(e) => setCompanyForm((f) => ({ ...f, printerPort: e.target.value }))}
            type="number"
            placeholder="9100"
          />
        </label>

        <div style={{ gridColumn: 'span 12' }}>
          <button className="btn-primary" type="submit" disabled={companyLoading}>
            {companyLoading ? 'Guardando...' : 'Guardar datos'}
          </button>
        </div>
      </form>
      {company ? (
        <p style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 12 }}>
          Última actualización: {new Date(company.updatedAt).toLocaleString('es-HN')}
        </p>
      ) : null}
    </section>
  );
}
