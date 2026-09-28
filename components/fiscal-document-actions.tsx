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

type Props = {
  origen: 'compra' | 'venta' | 'molido';
  transactionId: string;
  documento: FiscalDocumentDTO | null;
  /** CAI activo del tipo que le toca a este origen; null si no hay ninguno. */
  caiActivo: FiscalCaiDTO | null;
  onChange: () => void | Promise<void>;
};

export default function FiscalDocumentActions({ origen, transactionId, documento, caiActivo, onChange }: Props) {
  const [numeroManual, setNumeroManual] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // En modo talonario el número lo trae el papel, así que hay que escribirlo.
  const pideNumero = caiActivo?.modo === 'TALONARIO';

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
        }),
      }).then(parseApiResponse);
      setNumeroManual('');
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
            Ya no se puede anular: se emitió el {documento.fechaEmision}.
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
