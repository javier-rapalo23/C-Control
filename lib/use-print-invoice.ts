'use client';

import { useCallback, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { PrintFormat } from '@/lib/print-formats';

/**
 * Imprime la factura de una transacción en el formato pedido.
 *
 * Los dos formatos son el **mismo documento**: A4 abre la hoja en una pestaña y deja
 * que el navegador la mande a la impresora; 80 mm encola un `PrintJob` que el agente
 * local envía a la térmica por TCP. De ahí que solo el segundo tenga que esperar: hay
 * un proceso ajeno en medio que puede fallar, y el usuario necesita saberlo.
 */

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

const ESPERA_MAXIMA_MS = 20_000;

type OpcionesImpresion = {
  /**
   * La transacción todavía no tiene documento emitido: se emite antes de imprimir.
   * Entregar el documento fiscal es obligatorio, así que imprimir nunca saca el
   * comprobante interno; emitir aquí consume el siguiente número del CAI.
   */
  emitir?: boolean;
  /** Se llama tras emitir, para que el panel recargue los documentos. */
  onEmitido?: () => void | Promise<void>;
  /**
   * Pestaña ya abierta para la hoja A4. La pasa quien tiene que esperar algo antes de
   * imprimir —guardar la compra, por ejemplo—: abierta después de ese `await`, el
   * navegador la tomaría por un popup y la bloquearía.
   */
  pestana?: Window | null;
};

async function emitirDocumento(origen: 'compra' | 'venta' | 'molido', transactionId: string) {
  await fetch('/api/fiscal-documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origen, transactionId }),
  }).then(parseApiResponse);
}

export function usePrintInvoice() {
  const [imprimiendoId, setImprimiendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imprimir = useCallback(
    // Con `origen = 'nota'`, el id es el del **documento**: una nota de crédito no ampara
    // ninguna transacción.
    async (
      origen: 'compra' | 'venta' | 'molido' | 'nota',
      transactionId: string,
      formato: PrintFormat,
      opciones: OpcionesImpresion = {},
    ) => {
      setError(null);
      const debeEmitir = Boolean(opciones.emitir) && origen !== 'nota';

      if (formato === 'a4') {
        const url = `/print/${origen}/${transactionId}`;
        if (!debeEmitir) {
          if (opciones.pestana) opciones.pestana.location.href = url;
          else window.open(url, '_blank', 'noopener');
          return;
        }
        // La pestaña se abre ya, dentro del clic: abierta después del `await` el
        // navegador la toma por un popup y la bloquea.
        const pestana = opciones.pestana !== undefined ? opciones.pestana : window.open('', '_blank');
        if (pestana) pestana.opener = null;
        try {
          setImprimiendoId(transactionId);
          await emitirDocumento(origen as 'compra' | 'venta' | 'molido', transactionId);
          await opciones.onEmitido?.();
          if (pestana) pestana.location.href = url;
          else window.open(url, '_blank', 'noopener');
        } catch (err) {
          pestana?.close();
          setError(err instanceof Error ? err.message : 'Error emitiendo el documento');
        } finally {
          setImprimiendoId(null);
        }
        return;
      }

      try {
        setImprimiendoId(transactionId);
        if (debeEmitir) {
          await emitirDocumento(origen as 'compra' | 'venta' | 'molido', transactionId);
          await opciones.onEmitido?.();
        }
        const { jobId } = await fetch('/api/print/ticket', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transactionId, kind: origen }),
        }).then(parseApiResponse<{ jobId: string; status: string }>);

        const limite = Date.now() + ESPERA_MAXIMA_MS;
        let status = 'pending';
        let jobError: string | null = null;

        while (Date.now() < limite) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const job = await fetch(`/api/print/jobs/${jobId}`, { cache: 'no-store' }).then(
            parseApiResponse<{ status: string; error: string | null }>,
          );
          status = job.status;
          jobError = job.error;
          if (status === 'done' || status === 'error') break;
        }

        if (status === 'error') {
          setError(jobError || 'Error imprimiendo el ticket');
        } else if (status !== 'done') {
          setError('La impresora no respondió a tiempo. Verifica que esté encendida y conectada a la red.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error imprimiendo el ticket');
      } finally {
        setImprimiendoId(null);
      }
    },
    [],
  );

  return { imprimir, imprimiendoId, error, setError };
}
