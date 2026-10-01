'use client';

import { useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { FiscalCaiDTO, FiscalDocumentDTO } from '@/types/domain';

/**
 * Emitir y anular el documento fiscal de una transacción, para usar dentro de la fila
 * de Compras, Ventas o Molido.
 *
 * Emitir y anular son acciones con permiso propio: si el usuario no lo tiene, la API
 * responde 403 y el mensaje se muestra tal cual. El botón no se esconde —esconderlo
 * haría creer que la función no existe— y el control real está en el servidor.
 */

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const money = (valor: number) => `L ${valor.toFixed(2)}`;

type Props = {
  origen: 'compra' | 'venta' | 'molido';
  transactionId: string;
  documento: FiscalDocumentDTO | null;
  /** CAI activo del tipo que le toca a este origen; null si no hay ninguno. */
  caiActivo: FiscalCaiDTO | null;
  /** CAI activos por tipo: las notas tienen su propia serie. */
  caisActivos?: Record<string, FiscalCaiDTO>;
  /**
   * El cliente de esta transacción tiene constancia de registro de exonerado. Solo
   * entonces se pide la orden de compra exenta: en una operación normal sería un campo
   * más que estorba en cada fila.
   */
  clienteExonerado?: boolean;
  /** Imprime una nota ya emitida, en el formato configurado. */
  onImprimirNota?: (documentoId: string) => void;
  onChange: () => void | Promise<void>;
};

export default function FiscalDocumentActions({
  origen,
  transactionId,
  documento,
  caiActivo,
  caisActivos,
  clienteExonerado,
  onImprimirNota,
  onChange,
}: Props) {
  const [numeroManual, setNumeroManual] = useState('');
  const [ordenCompraExenta, setOrdenCompraExenta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nota de crédito o débito: es lo único que corrige un documento después del día de
  // emisión, porque anular está limitado al mismo día.
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [notaTipo, setNotaTipo] = useState<'nota_credito' | 'nota_debito'>('nota_credito');
  const [notaMonto, setNotaMonto] = useState('');
  const [notaMotivo, setNotaMotivo] = useState('');
  const [notaNumeroManual, setNotaNumeroManual] = useState('');

  // En modo talonario el número lo trae el papel, así que hay que escribirlo.
  const pideNumero = caiActivo?.modo === 'TALONARIO';
  const caiNota = caisActivos?.[notaTipo] ?? null;
  const notaPideNumero = caiNota?.modo === 'TALONARIO';

  async function emitirNota() {
    if (!documento) return;
    try {
      setTrabajando(true);
      setError(null);
      await fetch(`/api/fiscal-documents/${documento.id}/nota`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: notaTipo,
          monto: Number(notaMonto),
          motivo: notaMotivo,
          ...(notaPideNumero ? { numeroManual: Number(notaNumeroManual) } : {}),
        }),
      }).then(parseApiResponse);
      setNotaAbierta(false);
      setNotaMonto('');
      setNotaMotivo('');
      setNotaNumeroManual('');
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error emitiendo la nota');
    } finally {
      setTrabajando(false);
    }
  }

  function abrirNota() {
    // El monto arranca en el saldo: lo más común es corregir el documento completo, y
    // escribir el total a mano es donde se equivoca uno.
    setNotaMonto(documento ? String(documento.saldoAcreditable) : '');
    setNotaAbierta(true);
  }

  async function emitir() {
    try {
      setTrabajando(true);
      setError(null);
      await fetch('/api/fiscal-documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origen,
          transactionId,
          ...(pideNumero ? { numeroManual: Number(numeroManual) } : {}),
          ...(ordenCompraExenta.trim() ? { ordenCompraExenta: ordenCompraExenta.trim() } : {}),
        }),
      }).then(parseApiResponse);
      setNumeroManual('');
      setOrdenCompraExenta('');
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error emitiendo el documento');
    } finally {
      setTrabajando(false);
    }
  }

  async function anular() {
    if (!documento) return;
    try {
      setTrabajando(true);
      setError(null);
      await fetch(`/api/fiscal-documents/${documento.id}/anular`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          motivo,
          copiaFisicaResguardada: ubicacion.trim() !== '',
          copiaFisicaUbicacion: ubicacion.trim() || undefined,
        }),
      }).then(parseApiResponse);
      setMotivo('');
      setUbicacion('');
      setAnulando(false);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error anulando el documento');
    } finally {
      setTrabajando(false);
    }
  }

  if (documento) {
    const anulado = documento.estado === 'anulado';
    return (
      <div style={{ fontSize: 12, marginTop: 4 }}>
        <div style={{ color: anulado ? 'var(--danger)' : 'var(--text-soft)' }}>
          {documento.tipoDocumentoLabel} <strong>{documento.numeroCompleto}</strong>
          {anulado ? ' · ANULADO' : ''}
        </div>
        {anulado && documento.anulacionMotivo ? (
          <div style={{ color: 'var(--text-soft)' }}>Motivo: {documento.anulacionMotivo}</div>
        ) : null}

        {/* Solo el mismo día de la emisión; después hace falta una nota de crédito. */}
        {!anulado && documento.anulable && !anulando ? (
          <button className="btn-danger" type="button" style={{ marginTop: 4 }} onClick={() => setAnulando(true)}>
            Anular documento
          </button>
        ) : null}
        {!anulado && !documento.anulable ? (
          <div style={{ color: 'var(--text-soft)' }}>
            Ya no se puede anular: se emitió el {documento.fechaEmision}. Se corrige con una nota.
          </div>
        ) : null}

        {/* Notas ya emitidas sobre este documento. Se listan siempre: son parte del
            documento para la contadora, y cada una se puede reimprimir. */}
        {documento.notas.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            {documento.notas.map((nota) => (
              <div key={nota.id} style={{ color: nota.estado === 'anulado' ? 'var(--danger)' : 'var(--text-soft)' }}>
                {nota.tipoDocumentoLabel} <strong>{nota.numeroCompleto}</strong> ·{' '}
                {nota.tipoDocumento === 'nota_credito' ? '−' : '+'}
                {money(nota.total)}
                {nota.estado === 'anulado' ? ' · ANULADA' : ''}
                {onImprimirNota ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginLeft: 6, padding: '2px 6px' }}
                    onClick={() => onImprimirNota(nota.id)}
                  >
                    Imprimir
                  </button>
                ) : null}
              </div>
            ))}
            <div style={{ color: 'var(--text-soft)' }}>Queda por acreditar {money(documento.saldoAcreditable)}.</div>
          </div>
        ) : null}

        {/* Emitir nota: disponible mientras el documento no esté anulado. El mismo día,
            anular sigue siendo el camino más simple; después es el único. */}
        {!anulado && !notaAbierta ? (
          <button type="button" style={{ marginTop: 4, marginLeft: documento.anulable ? 6 : 0 }} onClick={abrirNota}>
            Nota de crédito o débito
          </button>
        ) : null}

        {notaAbierta ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <select value={notaTipo} onChange={(event) => setNotaTipo(event.target.value as typeof notaTipo)}>
              <option value="nota_credito">Nota de crédito (resta)</option>
              <option value="nota_debito">Nota de débito (suma)</option>
            </select>
            {caiNota === null ? (
              <span style={{ color: 'var(--text-soft)' }}>
                No hay CAI activo para este tipo de nota. Se registra en Mantenimiento → Facturación.
              </span>
            ) : null}
            <input
              value={notaMonto}
              onChange={(event) => setNotaMonto(event.target.value)}
              inputMode="decimal"
              placeholder={
                notaTipo === 'nota_credito'
                  ? `Monto (máximo ${money(documento.saldoAcreditable)})`
                  : 'Monto de la nota'
              }
            />
            <input
              value={notaMotivo}
              onChange={(event) => setNotaMotivo(event.target.value)}
              placeholder="Motivo (obligatorio): qué se corrige y por qué"
            />
            {notaPideNumero ? (
              <input
                value={notaNumeroManual}
                onChange={(event) => setNotaNumeroManual(event.target.value)}
                inputMode="numeric"
                placeholder={`No. del talonario (${caiNota?.rangoDesde}–${caiNota?.rangoHasta})`}
              />
            ) : null}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-primary"
                type="button"
                disabled={
                  trabajando ||
                  caiNota === null ||
                  notaMotivo.trim().length < 4 ||
                  !(Number(notaMonto) > 0) ||
                  (notaPideNumero && notaNumeroManual.trim() === '')
                }
                onClick={() => void emitirNota()}
              >
                {trabajando ? 'Emitiendo...' : 'Emitir nota'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setNotaAbierta(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {anulando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <input
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Motivo de la anulación (obligatorio)"
            />
            <input
              value={ubicacion}
              onChange={(event) => setUbicacion(event.target.value)}
              placeholder="Dónde queda archivada la copia física"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-danger"
                type="button"
                disabled={trabajando || motivo.trim().length < 4}
                onClick={() => void anular()}
              >
                {trabajando ? 'Anulando...' : 'Confirmar anulación'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setAnulando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div style={{ color: 'var(--danger)' }}>{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, marginTop: 4 }}>
      {caiActivo === null ? (
        <span style={{ color: 'var(--text-soft)' }}>Sin CAI activo: no se puede emitir.</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {pideNumero ? (
            <input
              value={numeroManual}
              onChange={(event) => setNumeroManual(event.target.value)}
              placeholder={`No. del talonario (${caiActivo.rangoDesde}–${caiActivo.rangoHasta})`}
              inputMode="numeric"
              style={{ maxWidth: 200 }}
            />
          ) : null}
          {/* Solo si el cliente está exonerado: la orden de compra exenta ampara esta
              operación y va impresa en el bloque del adquiriente exonerado. */}
          {clienteExonerado ? (
            <input
              value={ordenCompraExenta}
              onChange={(event) => setOrdenCompraExenta(event.target.value)}
              placeholder="Orden de compra exenta"
              style={{ maxWidth: 200 }}
            />
          ) : null}
          <button
            className="btn-primary"
            type="button"
            disabled={trabajando || (pideNumero && numeroManual.trim() === '')}
            onClick={() => void emitir()}
          >
            {trabajando ? 'Emitiendo...' : 'Emitir documento fiscal'}
          </button>
          {!pideNumero && caiActivo.estadoRango.siguienteNumero ? (
            <span style={{ color: 'var(--text-soft)' }}>sigue {caiActivo.estadoRango.siguienteNumero}</span>
          ) : null}
        </div>
      )}
      {error ? <div style={{ color: 'var(--danger)' }}>{error}</div> : null}
    </div>
  );
}
