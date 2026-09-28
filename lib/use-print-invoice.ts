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

export function usePrintInvoice() {
  const [imprimiendoId, setImprimiendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imprimir = useCallback(
    // Con `origen = 'nota'`, el id es el del **documento**: una nota de crédito no ampara
    // ninguna transacción.
    async (origen: 'compra' | 'venta' | 'molido' | 'nota', transactionId: string, formato: PrintFormat) => {
      setError(null);

      if (formato === 'a4') {
        window.open(`/print/${origen}/${transactionId}`, '_blank', 'noopener');
        return;
      }

      try {
        setImprimiendoId(transactionId);
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
