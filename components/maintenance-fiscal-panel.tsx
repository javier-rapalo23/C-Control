'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { CompanySettingsDTO, FiscalCaiDTO } from '@/types/domain';
import { MODOS_CAI, TIPOS_DOCUMENTO_FISCAL, formatNumeroFiscal } from '@/lib/fiscal';
import { DEFAULT_PRINT_FORMAT, PRINT_FORMATS, type PrintFormat, isPrintFormat } from '@/lib/print-formats';

/**
 * Administración del CAI: lo carga la contadora con la autorización del SAR en la
 * mano, así que la pantalla muestra cómo quedará el número **antes** de guardar y
 * valida los códigos de entrada. Un dígito mal tecleado acá se arrastra a todos los
 * documentos que se emitan después.
 *
 * Todavía no emite nada: esto solo registra el CAI y su estado (Fase 1).
 */

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const TIPOS_SELECCIONABLES = TIPOS_DOCUMENTO_FISCAL.filter((tipo) => tipo.aplicaA.length > 0);

/**
 * En qué parte de la operación se usa cada documento. Es información del negocio, no del
 * catálogo: la boleta de compra es la que se le entrega al productor y la factura la del
 * comprador, y cada una lleva su propia autorización y su propio rango.
 */
const USO_POR_TIPO: Record<string, string> = {
  boleta_compra: 'Compras',
  factura: 'Ventas y molido',
  nota_credito: 'Correcciones que restan',
  nota_debito: 'Correcciones que suman',
};

const formInicial = {
  tipoDocumento: TIPOS_SELECCIONABLES[0]?.key ?? 'factura',
  codigo: '',
  codigoEstablecimiento: '001',
  codigoPuntoEmision: '001',
  codigoTipoDocumento: '01',
  rangoDesde: '1',
  rangoHasta: '',
  fechaLimite: '',
  modo: 'TALONARIO' as (typeof MODOS_CAI)[number],
  alertaPorcentaje: '80',
  alertaDiasPrevios: '30',
  notas: '',
};

export default function MaintenanceFiscalPanel() {
  const [cais, setCais] = useState<FiscalCaiDTO[]>([]);
  const [form, setForm] = useState(formInicial);
  const [formato, setFormato] = useState<PrintFormat>(DEFAULT_PRINT_FORMAT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const fetchCais = useCallback(async () => {
    try {
      setLoading(true);
      const [data, empresa] = await Promise.all([
        fetch('/api/fiscal-cais', { cache: 'no-store' }).then(parseApiResponse<FiscalCaiDTO[]>),
        fetch('/api/settings/company', { cache: 'no-store' }).then(parseApiResponse<CompanySettingsDTO>),
      ]);
      setCais(data);
      setFormato(
        isPrintFormat(empresa.formatoImpresionDefault) ? empresa.formatoImpresionDefault : DEFAULT_PRINT_FORMAT,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando los CAI');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCais();
  }, [fetchCais]);

  async function guardarFormato(nuevo: PrintFormat) {
    const anterior = formato;
    try {
      // Se cambia de una vez en pantalla: es un radio, y esperar la respuesta para
      // moverlo se siente roto. Si falla, se regresa.
      setFormato(nuevo);
      setError(null);
      setMensaje(null);
      await fetch('/api/settings/company', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formatoImpresionDefault: nuevo }),
      }).then(parseApiResponse);
      setMensaje('Formato de impresión guardado.');
    } catch (err) {
      setFormato(anterior);
      setError(err instanceof Error ? err.message : 'Error guardando el formato');
    }
  }

  // Previsualización del primer número: es la forma de revisar los tres códigos sin
  // tener que emitir para descubrir que estaban mal.
  const primerNumero =
    form.rangoDesde && /^\d{3}$/.test(form.codigoEstablecimiento) && /^\d{3}$/.test(form.codigoPuntoEmision) && /^\d{2}$/.test(form.codigoTipoDocumento)
      ? formatNumeroFiscal({
          codigoEstablecimiento: form.codigoEstablecimiento,
          codigoPuntoEmision: form.codigoPuntoEmision,
          codigoTipoDocumento: form.codigoTipoDocumento,
          correlativo: Number(form.rangoDesde),
        })
      : null;

  const totalRango =
    form.rangoDesde && form.rangoHasta ? Number(form.rangoHasta) - Number(form.rangoDesde) + 1 : null;

  async function crear(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setMensaje(null);
      await fetch('/api/fiscal-cais', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipoDocumento: form.tipoDocumento,
          codigo: form.codigo.trim(),
          codigoEstablecimiento: form.codigoEstablecimiento.trim(),
          codigoPuntoEmision: form.codigoPuntoEmision.trim(),
          codigoTipoDocumento: form.codigoTipoDocumento.trim(),
          rangoDesde: Number(form.rangoDesde),
          rangoHasta: Number(form.rangoHasta),
          fechaLimite: form.fechaLimite,
          modo: form.modo,
          alertaPorcentaje: Number(form.alertaPorcentaje),
          alertaDiasPrevios: Number(form.alertaDiasPrevios),
          notas: form.notas.trim() || undefined,
        }),
      }).then(parseApiResponse);

      setForm(formInicial);
      setMensaje('CAI registrado. El anterior del mismo tipo quedó inactivo.');
      await fetchCais();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el CAI');
    } finally {
      setSaving(false);
    }
  }

  async function actualizar(id: string, cambios: Record<string, unknown>) {
    try {
      setError(null);
      setMensaje(null);
      await fetch(`/api/fiscal-cais/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      }).then(parseApiResponse);
      await fetchCais();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando el CAI');
    }
  }

  async function eliminar(id: string) {
    try {
      setError(null);
      setMensaje(null);
      await fetch(`/api/fiscal-cais/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchCais();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando el CAI');
    }
  }

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <h3>Formato de impresión</h3>
        <p style={{ color: 'var(--text-soft)' }}>
          Con cuál de los dos formatos se imprime la factura normalmente. Son el <strong>mismo
          documento</strong>: llevan el mismo número, el mismo CAI y el mismo desglose; lo que cambia es
          el papel. Los dos se imprimen desde el navegador. En papel continuo sale una sola hoja,
          porque el papel trae la copia.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {PRINT_FORMATS.map((opcion) => (
            <label key={opcion.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <input
                type="radio"
                name="formatoImpresion"
                checked={formato === opcion.key}
                onChange={() => void guardarFormato(opcion.key)}
                style={{ width: 'auto' }}
              />
              <span>
                <strong>{opcion.label}</strong>
                <span style={{ color: 'var(--text-soft)' }}> — {opcion.descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Cada tipo de documento tiene su propia autorización y su propio rango: la boleta
          de compra es para las compras y la factura para las ventas. Sin este resumen no
          era evidente que faltaba registrar una de las dos. */}
      <section className="card" style={{ marginTop: 12 }}>
        <h3>Qué autorización hace falta</h3>
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Tipo de documento</th>
              <th>Se usa en</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_SELECCIONABLES.map((tipo) => {
              const activo = cais.find((cai) => cai.tipoDocumento === tipo.key && cai.estado === 'activo') ?? null;

              return (
                <tr key={tipo.key} style={activo ? undefined : { color: 'var(--text-soft)' }}>
                  <td>{tipo.label}</td>
                  <td>{USO_POR_TIPO[tipo.key] ?? '—'}</td>
                  <td>
                    {activo ? (
                      <>
                        CAI <strong>{activo.codigo}</strong>, rango {activo.rangoDesde}–{activo.rangoHasta}
                        {activo.estadoRango.motivoNoEmitible ? (
                          <strong> · {activo.estadoRango.motivoNoEmitible}</strong>
                        ) : (
                          <> · quedan {activo.estadoRango.disponibles}</>
                        )}
                      </>
                    ) : (
                      'Sin CAI activo: no se puede emitir este documento'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>Factura autorizada (SAR)</h3>
        <p style={{ color: 'var(--text-soft)' }}>
          Datos de la autorización del SAR: el CAI, los códigos que forman el número y el rango de
          correlativos. Mientras no haya un CAI activo, el sistema sigue imprimiendo comprobantes
          internos como hasta ahora.
        </p>

        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {mensaje ? <p style={{ color: 'var(--text-soft)' }}>{mensaje}</p> : null}

        <form onSubmit={(event) => void crear(event)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 4' }}>
            Tipo de documento
            <select
              value={form.tipoDocumento}
              onChange={(event) => setForm((f) => ({ ...f, tipoDocumento: event.target.value }))}
            >
              {TIPOS_SELECCIONABLES.map((tipo) => (
                <option key={tipo.key} value={tipo.key}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 8' }}>
            CAI
            <input
              value={form.codigo}
              onChange={(event) => setForm((f) => ({ ...f, codigo: event.target.value }))}
              placeholder="Tal como aparece en la autorización"
              required
            />
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            Establecimiento
            <input
              value={form.codigoEstablecimiento}
              onChange={(event) => setForm((f) => ({ ...f, codigoEstablecimiento: event.target.value }))}
              inputMode="numeric"
              pattern="\d{3}"
              maxLength={3}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            Punto emisión
            <input
              value={form.codigoPuntoEmision}
              onChange={(event) => setForm((f) => ({ ...f, codigoPuntoEmision: event.target.value }))}
              inputMode="numeric"
              pattern="\d{3}"
              maxLength={3}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            Cód. documento
            <input
              value={form.codigoTipoDocumento}
              onChange={(event) => setForm((f) => ({ ...f, codigoTipoDocumento: event.target.value }))}
              inputMode="numeric"
              pattern="\d{2}"
              maxLength={2}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Rango desde
            <input
              type="number"
              min="1"
              step="1"
              value={form.rangoDesde}
              onChange={(event) => setForm((f) => ({ ...f, rangoDesde: event.target.value }))}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Rango hasta
            <input
              type="number"
              min="1"
              step="1"
              value={form.rangoHasta}
              onChange={(event) => setForm((f) => ({ ...f, rangoHasta: event.target.value }))}
              required
            />
          </label>

          <label style={{ gridColumn: 'span 3' }}>
            Fecha límite de emisión
            <input
              type="date"
              value={form.fechaLimite}
              onChange={(event) => setForm((f) => ({ ...f, fechaLimite: event.target.value }))}
              required
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Quién pone el número
            <select
              value={form.modo}
              onChange={(event) => setForm((f) => ({ ...f, modo: event.target.value as typeof form.modo }))}
            >
              <option value="TALONARIO">Talonario (a mano)</option>
              <option value="SISTEMA">El sistema (autoimpresor)</option>
            </select>
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Avisar al usar %
            <input
              type="number"
              min="1"
              max="100"
              value={form.alertaPorcentaje}
              onChange={(event) => setForm((f) => ({ ...f, alertaPorcentaje: event.target.value }))}
            />
          </label>
          <label style={{ gridColumn: 'span 3' }}>
            Avisar días antes
            <input
              type="number"
              min="0"
              max="365"
              value={form.alertaDiasPrevios}
              onChange={(event) => setForm((f) => ({ ...f, alertaDiasPrevios: event.target.value }))}
            />
          </label>
          <label style={{ gridColumn: 'span 12' }}>
            Notas (opcional)
            <input value={form.notas} onChange={(event) => setForm((f) => ({ ...f, notas: event.target.value }))} />
          </label>

          <div style={{ gridColumn: 'span 12' }}>
            {primerNumero ? (
              <p style={{ color: 'var(--text-soft)', margin: '0 0 8px' }}>
                Primer número que se emitiría: <strong>{primerNumero}</strong>
                {totalRango && totalRango > 0 ? ` · ${totalRango} documentos en el rango` : ''}
              </p>
            ) : null}
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar CAI'}
            </button>
            <span style={{ marginLeft: 8, color: 'var(--text-soft)' }}>
              Al registrarlo, el CAI activo de ese tipo de documento pasa a inactivo.
            </span>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>CAI registrados</h3>
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Documento</th>
              <th>CAI</th>
              <th>Rango</th>
              <th>Usados</th>
              <th>Vence</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {cais.map((cai) => {
              const rango = cai.estadoRango;
              const problema = rango.motivoNoEmitible;
              return (
                <tr key={cai.id}>
                  <td>
                    {cai.tipoDocumentoLabel}
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                      {cai.codigoEstablecimiento}-{cai.codigoPuntoEmision}-{cai.codigoTipoDocumento} ·{' '}
                      {cai.modo === 'SISTEMA' ? 'lo numera el sistema' : 'talonario a mano'}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{cai.codigo}</td>
                  <td>
                    {cai.rangoDesde} – {cai.rangoHasta}
                    {rango.siguienteNumero ? (
                      <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>sigue {rango.siguienteNumero}</div>
                    ) : null}
                  </td>
                  <td style={{ color: rango.alertaRango ? 'var(--danger)' : undefined }}>
                    {rango.usados} / {rango.total} ({rango.porcentajeUsado} %)
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                      {rango.disponibles} disponibles
                    </div>
                  </td>
                  <td style={{ color: rango.vencido || rango.alertaVencimiento ? 'var(--danger)' : undefined }}>
                    {cai.fechaLimite}
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                      {rango.vencido
                        ? `vencido hace ${Math.abs(rango.diasParaVencer)} días`
                        : `faltan ${rango.diasParaVencer} días`}
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: problema ? 'var(--danger)' : undefined }}>
                      {cai.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </strong>
                    {problema ? (
                      <div style={{ fontSize: 12, color: 'var(--danger)' }}>{problema}</div>
                    ) : null}
                    {cai.documentosEmitidos > 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                        {cai.documentosEmitidos} documentos emitidos
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          void actualizar(cai.id, { estado: cai.estado === 'activo' ? 'inactivo' : 'activo' })
                        }
                      >
                        {cai.estado === 'activo' ? 'Desactivar' : 'Activar'}
                      </button>
                      {/* Un CAI con documentos es historial fiscal: la API lo rechaza. */}
                      {cai.documentosEmitidos === 0 ? (
                        <button className="btn-danger" type="button" onClick={() => void eliminar(cai.id)}>
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {cais.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {loading ? 'Cargando...' : 'No hay CAI registrado. El sistema imprime comprobantes internos.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
