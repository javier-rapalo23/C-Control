'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Printer } from 'lucide-react';
import type { ApiResponse } from '@/types/api';
import type { AccountStatementDTO, ClientDTO, ReceivableClientDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';
import { CASH_PAYMENT_METHOD, SETTLEMENT_METHODS, type PaymentMethod } from '@/lib/payment-methods';
import ClientSearchSelect from '@/components/client-search-select';
import ErrorToast from '@/components/error-toast';
import LoadingOverlay from '@/components/loading-overlay';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const money = (value: number) => `L ${value.toFixed(2)}`;

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Aplicación automática: de la venta más antigua a la más reciente. */
const APLICAR_AUTOMATICO = '';

/**
 * Cuentas por cobrar: las ventas al crédito y sus abonos.
 *
 * Un cliente puede pagar por partes —un depósito hoy, otro la semana siguiente— y una
 * boleta puede cubrir varias facturas. Por eso el abono se registra al cliente y se
 * reparte solo, salvo que se elija una venta.
 */
export default function ReceivablesPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [resumen, setResumen] = useState<ReceivableClientDTO[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [statement, setStatement] = useState<AccountStatementDTO | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Formulario del abono.
  const [businessDate, setBusinessDate] = useState(todayDateString());
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('deposito');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [aplicarA, setAplicarA] = useState(APLICAR_AUTOMATICO);
  const [guardando, setGuardando] = useState(false);

  const fetchResumen = useCallback(async () => {
    const data = await fetch('/api/receivables', { cache: 'no-store' }).then(parseApiResponse<ReceivableClientDTO[]>);
    setResumen(data);
  }, []);

  const fetchClients = useCallback(async () => {
    const data = await fetch('/api/clients', { cache: 'no-store' }).then(parseApiResponse<ClientDTO[]>);
    setClients(data.filter((client) => !client.esGeneral));
  }, []);

  const fetchStatement = useCallback(async () => {
    if (!selectedClientId) {
      setStatement(null);
      return;
    }
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    const data = await fetch(`/api/receivables/${selectedClientId}?${params}`, { cache: 'no-store' }).then(
      parseApiResponse<AccountStatementDTO>,
    );
    setStatement(data);
  }, [selectedClientId, desde, hasta]);

  const run = useCallback(async (task: () => Promise<unknown>, mensaje: string) => {
    try {
      setLoading(true);
      setError(null);
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : mensaje);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(() => Promise.all([fetchResumen(), fetchClients()]), 'Error cargando cuentas por cobrar');
  }, [run, fetchResumen, fetchClients]);

  useEffect(() => {
    void run(fetchStatement, 'Error cargando el estado de cuenta');
  }, [run, fetchStatement]);

  // Al cambiar de cliente, la venta elegida del anterior ya no aplica.
  useEffect(() => {
    setAplicarA(APLICAR_AUTOMATICO);
    setMonto('');
    setAviso(null);
  }, [selectedClientId]);

  const totalPorCobrar = useMemo(() => resumen.reduce((suma, fila) => suma + fila.saldo, 0), [resumen]);
  const vencidas = useMemo(() => resumen.filter((fila) => fila.diasMasAntigua > 30).length, [resumen]);

  const pendientes = statement?.pendientes ?? [];
  // Lo máximo que puede abonarse: el saldo de la venta elegida o el del cliente.
  const maximo = aplicarA
    ? (pendientes.find((venta) => venta.id === aplicarA)?.saldo ?? 0)
    : (statement?.saldoActual ?? 0);

  async function registrarAbono(event: FormEvent) {
    event.preventDefault();
    if (!selectedClientId) return;

    const valor = Number(monto);
    if (!(valor > 0)) {
      setError('Escribe el monto del abono');
      return;
    }
    if (valor > maximo + 0.001) {
      setError(`El abono no puede pasar del saldo pendiente (${money(maximo)})`);
      return;
    }

    try {
      setGuardando(true);
      setError(null);
      await fetch('/api/client-payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate,
          sucursalId,
          clientId: selectedClientId,
          metodoPago,
          monto: valor,
          ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
          ...(aplicarA ? { saleTransactionId: aplicarA } : {}),
        }),
      }).then(parseApiResponse);

      setAviso(`Abono de ${money(valor)} registrado.`);
      setMonto('');
      setReferencia('');
      setNotas('');
      setAplicarA(APLICAR_AUTOMATICO);
      await Promise.all([fetchStatement(), fetchResumen()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando el abono');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarAbono(id: string) {
    if (!window.confirm('¿Eliminar este abono? Las facturas que cubría vuelven a quedar pendientes.')) return;
    await run(async () => {
      await fetch(`/api/client-payments/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await Promise.all([fetchStatement(), fetchResumen()]);
    }, 'Error eliminando el abono');
  }

  function imprimirEstado() {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    window.open(`/print/estado-cuenta/${selectedClientId}?${params}`, '_blank');
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Cuentas por cobrar</h1>
        <p>
          Saldos de las ventas al crédito. Los abonos pueden llegar por partes: cada uno se aplica a la factura
          más antigua, o a la que elijas.
        </p>
      </section>

      <ErrorToast message={error} onClose={() => setError(null)} />

      <section className="card-grid">
        <article className="card third kpi">
          <div className="label">Total por cobrar</div>
          <div className="value">{money(totalPorCobrar)}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Clientes con saldo</div>
          <div className="value">{resumen.length}</div>
        </article>
        <article className="card third kpi">
          <div className="label">Con facturas de más de 30 días</div>
          <div className="value" style={{ color: vencidas > 0 ? 'var(--danger)' : undefined }}>
            {vencidas}
          </div>
        </article>

        <article className="card wide">
          <h3>Saldos por cliente</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-like" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Facturas pendientes</th>
                  <th>Vendido al crédito</th>
                  <th>Abonado</th>
                  <th>Saldo</th>
                  <th>Más antigua</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resumen.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Ningún cliente tiene saldo pendiente.</td>
                  </tr>
                ) : (
                  resumen.map((fila) => (
                    <tr key={fila.clientId}>
                      <td>{fila.clientNombre}</td>
                      <td>{fila.ventasPendientes}</td>
                      <td>{money(fila.totalCredito)}</td>
                      <td>{money(fila.totalAbonado)}</td>
                      <td>
                        <strong>{money(fila.saldo)}</strong>
                      </td>
                      <td>
                        {fila.ventaMasAntigua}
                        <div style={{ fontSize: 12, color: fila.diasMasAntigua > 30 ? 'var(--danger)' : 'var(--text-soft)' }}>
                          hace {fila.diasMasAntigua} días
                        </div>
                      </td>
                      <td>
                        <button className="btn-secondary" type="button" onClick={() => setSelectedClientId(fila.clientId)}>
                          Ver cuenta
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card wide">
          <h3>Estado de cuenta</h3>
          <label style={{ marginTop: 8 }}>
            Cliente
            <ClientSearchSelect clients={clients} value={selectedClientId} onChange={setSelectedClientId} />
          </label>

          {statement ? (
            <>
              <dl className="row" style={{ margin: '12px 0 0', fontSize: 13 }}>
                {[
                  { label: 'RTN', value: statement.client.rtn },
                  { label: 'Clave IHCAFE', value: statement.client.claveIhcafe },
                  { label: 'Teléfono', value: statement.client.telefono },
                ]
                  .filter((dato) => dato.value)
                  .map((dato) => (
                    <div key={dato.label} style={{ gridColumn: 'span 4' }}>
                      <dt style={{ color: 'var(--text-soft)' }}>{dato.label}</dt>
                      <dd style={{ margin: 0, fontWeight: 500 }}>{dato.value}</dd>
                    </div>
                  ))}
                <div style={{ gridColumn: 'span 4' }}>
                  <dt style={{ color: 'var(--text-soft)' }}>Saldo actual</dt>
                  <dd style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{money(statement.saldoActual)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>
              Elige un cliente para ver sus movimientos y registrar abonos.
            </p>
          )}
        </article>

        {statement ? (
          <>
            <article className="card wide">
              <h3>Registrar abono</h3>
              {statement.saldoActual <= 0 ? (
                <p style={{ color: 'var(--text-soft)', marginTop: 8 }}>Este cliente no tiene saldo pendiente.</p>
              ) : (
                <form onSubmit={(event) => void registrarAbono(event)} className="row" style={{ marginTop: 8 }}>
                  <label style={{ gridColumn: 'span 4' }}>
                    Sucursal que recibe
                    <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
                      {sucursales.map((sucursal) => (
                        <option key={sucursal.id} value={sucursal.id}>
                          {sucursal.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: 'span 4' }}>
                    Fecha del abono
                    <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} required />
                  </label>
                  <label style={{ gridColumn: 'span 4' }}>
                    Forma de pago
                    <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value as PaymentMethod)}>
                      {SETTLEMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: 'span 4' }}>
                    Aplicar a
                    <select value={aplicarA} onChange={(event) => setAplicarA(event.target.value)}>
                      <option value={APLICAR_AUTOMATICO}>Automático (la más antigua primero)</option>
                      {pendientes.map((venta) => (
                        <option key={venta.id} value={venta.id}>
                          {venta.numeroInterno} · {venta.businessDate} · saldo {money(venta.saldo)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: 'span 4' }}>
                    Monto
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={monto}
                        onChange={(event) => setMonto(event.target.value)}
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={maximo.toFixed(2)}
                        required
                      />
                      <button
                        className="btn-secondary"
                        type="button"
                        style={{ flexShrink: 0 }}
                        onClick={() => setMonto(maximo.toFixed(2))}
                      >
                        Todo
                      </button>
                    </div>
                  </label>
                  <label style={{ gridColumn: 'span 4' }}>
                    {metodoPago === 'cheque' ? 'No. de cheque' : 'No. de boleta / referencia'}
                    <input
                      value={referencia}
                      onChange={(event) => setReferencia(event.target.value)}
                      maxLength={60}
                      placeholder="opcional"
                    />
                  </label>
                  <label style={{ gridColumn: 'span 12' }}>
                    Nota
                    <input value={notas} onChange={(event) => setNotas(event.target.value)} maxLength={250} placeholder="opcional" />
                  </label>
                  <div style={{ gridColumn: 'span 12', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn-primary" type="submit" disabled={guardando}>
                      {guardando ? 'Guardando…' : 'Registrar abono'}
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                      Máximo {money(maximo)}.{' '}
                      {metodoPago === CASH_PAYMENT_METHOD
                        ? 'En efectivo suma a la caja de esta sucursal en la fecha del abono.'
                        : 'Un depósito o un cheque no entra a la caja.'}
                    </span>
                  </div>
                  {aviso ? (
                    <p style={{ gridColumn: 'span 12', color: 'var(--success, inherit)', margin: 0 }}>{aviso}</p>
                  ) : null}
                </form>
              )}
            </article>

            <article className="card wide">
              <h3>Facturas pendientes</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="table-like" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Venta</th>
                      <th>Factura</th>
                      <th>Total</th>
                      <th>Abonado</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Sin facturas pendientes.</td>
                      </tr>
                    ) : (
                      pendientes.map((venta) => (
                        <tr key={venta.id}>
                          <td>
                            {venta.businessDate}
                            <div style={{ fontSize: 12, color: venta.dias > 30 ? 'var(--danger)' : 'var(--text-soft)' }}>
                              hace {venta.dias} días
                            </div>
                          </td>
                          <td>{venta.numeroInterno}</td>
                          <td>{venta.numeroFiscal ?? '—'}</td>
                          <td>{money(venta.total)}</td>
                          <td>{money(venta.abonado)}</td>
                          <td>
                            <strong>{money(venta.saldo)}</strong>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card wide">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Movimientos</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <label>
                    Desde
                    <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
                  </label>
                  <label>
                    Hasta
                    <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
                  </label>
                  <button className="btn-secondary" type="button" onClick={imprimirEstado}>
                    <Printer size={16} aria-hidden="true" /> Imprimir
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table-like" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Documento</th>
                      <th>Detalle</th>
                      <th>Cargo</th>
                      <th>Abono</th>
                      <th>Saldo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5}>
                        <strong>Saldo anterior</strong>
                      </td>
                      <td>
                        <strong>{money(statement.saldoAnterior)}</strong>
                      </td>
                      <td />
                    </tr>
                    {statement.movimientos.map((movimiento) => (
                      <tr key={`${movimiento.tipo}-${movimiento.id}`}>
                        <td>{movimiento.businessDate}</td>
                        <td>{movimiento.documento}</td>
                        <td>{movimiento.detalle}</td>
                        <td>{movimiento.cargo ? money(movimiento.cargo) : ''}</td>
                        <td>{movimiento.abono ? money(movimiento.abono) : ''}</td>
                        <td>{money(movimiento.saldo)}</td>
                        <td>
                          {movimiento.tipo === 'abono' ? (
                            <button className="btn-danger" type="button" onClick={() => void eliminarAbono(movimiento.id)}>
                              Eliminar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {statement.movimientos.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ color: 'var(--text-soft)' }}>
                          Sin movimientos en este período.
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td colSpan={3}>
                        <strong>Totales</strong>
                      </td>
                      <td>
                        <strong>{money(statement.totalCargos)}</strong>
                      </td>
                      <td>
                        <strong>{money(statement.totalAbonos)}</strong>
                      </td>
                      <td>
                        <strong>{money(statement.saldoFinal)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </>
        ) : null}
      </section>

      <LoadingOverlay active={loading} />
    </main>
  );
}
