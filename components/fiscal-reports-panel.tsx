'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { FiscalBookReportDTO, FiscalCaiDTO, FiscalPendingReportDTO } from '@/types/domain';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';

/**
 * Reportes fiscales, dentro de la pestaña Fiscal de Reportes.
 *
 * Es un componente aparte del panel de reportes porque no comparte casi nada con
 * ellos: acá la unidad no es el día ni el producto sino **el documento**, y lo que se
 * mira es que la numeración esté completa y que no quede nada sin emitir.
 *
 * El rango de fechas lo manda el panel de arriba, para que cambiar de pestaña no
 * obligue a volver a escribirlo. La sucursal solo aplica a los pendientes: un
 * documento fiscal no tiene sucursal propia —queda dentro de su snapshot— porque el
 * CAI es de la empresa, no de la bodega.
 */

type Vista = 'libro-compras' | 'libro-ventas' | 'pendientes' | 'cais';

const money = (value: number) => `L ${value.toFixed(2)}`;

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

/**
 * Descarga el CSV sin navegar.
 *
 * Apuntar un enlace directo al endpoint sería más corto, pero si la petición falla el
 * navegador reemplazaría la página por el JSON del error. Así el fallo cae en el
 * mismo aviso que el resto del panel.
 */
async function descargarCsv(url: string, nombre: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(body && !body.ok ? body.error.message : 'No se pudo generar el archivo.');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = objectUrl;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(objectUrl);
}

export default function FiscalReportsPanel({
  from,
  to,
  sucursalId,
}: {
  from: string;
  to: string;
  sucursalId: string;
}) {
  const [vista, setVista] = useState<Vista>('libro-compras');
  const [libro, setLibro] = useState<FiscalBookReportDTO | null>(null);
  const [pendientes, setPendientes] = useState<FiscalPendingReportDTO | null>(null);
  const [cais, setCais] = useState<FiscalCaiDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esLibro = vista === 'libro-compras' || vista === 'libro-ventas';
  const libroKind = vista === 'libro-ventas' ? 'ventas' : 'compras';

  const urlActual = useCallback(
    (formato?: 'csv') => {
      const params = new URLSearchParams({ from, to });
      if (formato) params.set('formato', formato);

      if (esLibro) {
        params.set('libro', libroKind);
        return `/api/reports/fiscal/libro?${params}`;
      }
      if (sucursalId) params.set('sucursalId', sucursalId);
      return `/api/reports/fiscal/pendientes?${params}`;
    },
    [esLibro, from, libroKind, sucursalId, to],
  );

  const consultar = useCallback(async () => {
    try {
      setLoading(true);

      if (vista === 'cais') {
        // El estado del CAI no depende del período: es el rango autorizado y lo que
        // queda de él hoy, así que se lee del mismo endpoint que Mantenimiento.
        setCais(await parseApiResponse<FiscalCaiDTO[]>(await fetch('/api/fiscal-cais', { cache: 'no-store' })));
      } else if (esLibro) {
        setLibro(await parseApiResponse<FiscalBookReportDTO>(await fetch(urlActual(), { cache: 'no-store' })));
      } else {
        setPendientes(
          await parseApiResponse<FiscalPendingReportDTO>(await fetch(urlActual(), { cache: 'no-store' })),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [esLibro, urlActual, vista]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  async function exportar() {
    try {
      const nombre = esLibro ? `libro-${libroKind}-${from}-a-${to}.csv` : `pendientes-de-emitir-${from}-a-${to}.csv`;
      await descargarCsv(urlActual('csv'), nombre);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={vista === 'libro-compras' ? 'btn-primary' : ''} onClick={() => setVista('libro-compras')}>
            Libro de compras
          </button>
          <button type="button" className={vista === 'libro-ventas' ? 'btn-primary' : ''} onClick={() => setVista('libro-ventas')}>
            Libro de ventas
          </button>
          <button type="button" className={vista === 'pendientes' ? 'btn-primary' : ''} onClick={() => setVista('pendientes')}>
            Pendientes de emitir
          </button>
          <button type="button" className={vista === 'cais' ? 'btn-primary' : ''} onClick={() => setVista('cais')}>
            Estado del CAI
          </button>
          {vista === 'cais' ? null : (
            <button type="button" onClick={() => void exportar()} style={{ marginLeft: 'auto' }}>
              Descargar CSV
            </button>
          )}
        </div>
        <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>
          {esLibro
            ? 'Un renglón por documento, por fecha de emisión. Los anulados aparecen y no suman en los totales.'
            : vista === 'pendientes'
              ? 'Compras, ventas y molidos del período que todavía no tienen documento fiscal.'
              : 'Rango autorizado y lo que queda de él. Se recalcula en cada consulta.'}
        </p>
      </section>

      <ErrorToast message={error} onClose={() => setError(null)} />

      {esLibro && libro ? (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h3>Totales del período</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Documentos</td>
                  <td>
                    {libro.totals.documentos}
                    {libro.totals.anulados > 0 ? ` (${libro.totals.anulados} anulados)` : ''}
                  </td>
                </tr>
                <tr>
                  <td>Importe exento</td>
                  <td>{money(libro.totals.importeExento)}</td>
                </tr>
                {libro.totals.importeExonerado > 0 ? (
                  <tr>
                    <td>Importe exonerado</td>
                    <td>{money(libro.totals.importeExonerado)}</td>
                  </tr>
                ) : null}
                {libro.totals.importeGravado15 > 0 ? (
                  <>
                    <tr>
                      <td>Gravado 15 %</td>
                      <td>{money(libro.totals.importeGravado15)}</td>
                    </tr>
                    <tr>
                      <td>ISV 15 %</td>
                      <td>{money(libro.totals.isv15)}</td>
                    </tr>
                  </>
                ) : null}
                {libro.totals.importeGravado18 > 0 ? (
                  <>
                    <tr>
                      <td>Gravado 18 %</td>
                      <td>{money(libro.totals.importeGravado18)}</td>
                    </tr>
                    <tr>
                      <td>ISV 18 %</td>
                      <td>{money(libro.totals.isv18)}</td>
                    </tr>
                  </>
                ) : null}
                <tr>
                  <td>Total del libro</td>
                  <td>
                    <strong>{money(libro.totals.total)}</strong>
                  </td>
                </tr>
                {libro.totals.totalAnulado > 0 ? (
                  <tr style={{ color: 'var(--text-soft)' }}>
                    <td>Anulado (no suma)</td>
                    <td>{money(libro.totals.totalAnulado)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {/* Un hueco en la numeración es lo primero que pregunta el SAR en una
              revisión: se muestra arriba de la tabla, no escondido al final. */}
          {libro.saltos.length > 0 ? (
            <section className="card" style={{ marginTop: 12 }}>
              <h3>Números que no aparecen en el período</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                No es necesariamente un error, pero cada uno debe poder explicarse: una hoja dañada del talonario, o un
                documento que se emitió fuera del sistema.
              </p>
              <table className="table-like" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>CAI</th>
                    <th>Tipo</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {libro.saltos.map((salto) => (
                    <tr key={`${salto.caiCodigo}-${salto.desde}`}>
                      <td>{salto.caiCodigo ?? '—'}</td>
                      <td>{salto.tipoDocumentoLabel}</td>
                      <td>{salto.desde}</td>
                      <td>{salto.hasta}</td>
                      <td>{salto.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Documentos</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="table-like" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Emisión</th>
                    <th>Número</th>
                    <th>Control interno</th>
                    <th>Cliente</th>
                    <th>RTN</th>
                    <th>Operación</th>
                    <th>Exento</th>
                    <th>Gravado</th>
                    <th>ISV</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {libro.rows.map((row) => (
                    <tr key={row.id} style={row.anulado ? { color: 'var(--text-soft)' } : undefined}>
                      <td>{row.fechaEmision}</td>
                      <td>
                        {row.numeroCompleto}
                        {row.anulado ? <strong> · ANULADO</strong> : null}
                      </td>
                      <td>{row.numeroInterno ?? '—'}</td>
                      <td>{row.clienteNombre ?? '—'}</td>
                      <td>{row.clienteRtn ?? '—'}</td>
                      <td>{row.businessDate}</td>
                      <td>{money(row.importeExento + row.importeExonerado)}</td>
                      <td>{money(row.importeGravado15 + row.importeGravado18)}</td>
                      <td>{money(row.isv15 + row.isv18)}</td>
                      <td>{money(row.total)}</td>
                    </tr>
                  ))}
                  {libro.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ color: 'var(--text-soft)' }}>
                        Sin documentos emitidos en el período.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {vista === 'pendientes' && pendientes ? (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h3>Totales del período</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Sin documento</td>
                  <td>
                    <strong>{pendientes.totals.documentos}</strong>
                  </td>
                </tr>
                {pendientes.totals.porOrigen.map((grupo) => (
                  <tr key={grupo.origen}>
                    <td>{grupo.origenLabel}</td>
                    <td>
                      {grupo.documentos} · {money(grupo.total)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Monto sin documentar</td>
                  <td>{money(pendientes.totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <h3>Transacciones</h3>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Control interno</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Total</th>
                  <th>Días</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.rows.map((row) => (
                  <tr key={`${row.origen}-${row.transactionId}`}>
                    <td>{row.businessDate}</td>
                    <td>{row.origenLabel}</td>
                    <td>{row.numeroInterno ?? '—'}</td>
                    <td>{row.clienteNombre}</td>
                    <td>{row.sucursalNombre}</td>
                    <td>{money(row.total)}</td>
                    <td>{row.diasSinEmitir}</td>
                  </tr>
                ))}
                {pendientes.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--text-soft)' }}>
                      Todo el período está documentado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {vista === 'cais' && cais ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>CAI registrados</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>CAI</th>
                  <th>Rango</th>
                  <th>Usados</th>
                  <th>Disponibles</th>
                  <th>Siguiente</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cais.map((cai) => {
                  const { estadoRango } = cai;
                  const aviso = estadoRango.alertaRango || estadoRango.alertaVencimiento;

                  return (
                    <tr key={cai.id} style={estadoRango.puedeEmitir ? undefined : { color: 'var(--text-soft)' }}>
                      <td>{cai.tipoDocumentoLabel}</td>
                      <td>{cai.codigo}</td>
                      <td>
                        {cai.rangoDesde} – {cai.rangoHasta}
                      </td>
                      <td>
                        {estadoRango.usados} ({estadoRango.porcentajeUsado} %)
                      </td>
                      <td>{estadoRango.disponibles}</td>
                      <td>{estadoRango.siguienteNumero ?? '—'}</td>
                      <td>
                        {cai.fechaLimite}
                        {estadoRango.vencido ? ' · vencido' : ` · ${estadoRango.diasParaVencer} días`}
                      </td>
                      <td>
                        {estadoRango.motivoNoEmitible ? (
                          <strong>{estadoRango.motivoNoEmitible}</strong>
                        ) : aviso ? (
                          <strong>
                            {estadoRango.alertaRango ? 'Rango por agotarse' : 'Vence pronto'}
                          </strong>
                        ) : (
                          'Emitiendo'
                        )}
                      </td>
                    </tr>
                  );
                })}
                {cais.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ color: 'var(--text-soft)' }}>
                      No hay ningún CAI registrado: sin él no se puede emitir. Se carga en Mantenimiento → Facturación.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <LoadingOverlay active={loading} />
    </>
  );
}
