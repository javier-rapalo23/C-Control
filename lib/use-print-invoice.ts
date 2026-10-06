'use client';

import { useCallback, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { PrintFormat } from '@/lib/print-formats';

/**
 * Imprime la factura de una transacción en el formato pedido.
 *
 * Los dos formatos —hoja A4 y papel continuo— son el **mismo documento** y se imprimen
 * igual: se abre la hoja en una pestaña y el navegador la manda a la impresora con su
 * diálogo. Lo único que cambia es el `?formato=` de la página, que decide el tamaño y
 * cuántas hojas salen.
 */

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

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
   * Pestaña ya abierta para la hoja. La pasa quien tiene que esperar algo antes de
   * imprimir —guardar la compra, por ejemplo—: abierta después de ese `await`, el
   * navegador la tomaría por un popup y la bloquearía.
   */
  pestana?: Window | null;
  /**
   * Lo que se escribió antes de guardar para emitir: el número del talonario y la orden
   * de compra exenta. Sin esto el documento sale con el siguiente número del CAI y sin
   * orden.
   */
  datosEmision?: { numeroManual?: number; ordenCompraExenta?: string };
};

async function emitirDocumento(
  origen: 'compra' | 'venta' | 'molido',
  transactionId: string,
  datos: OpcionesImpresion['datosEmision'] = {},
) {
  await fetch('/api/fiscal-documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origen, transactionId, ...datos }),
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
      const url = `/print/${origen}/${transactionId}?formato=${formato}`;

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
        await emitirDocumento(origen as 'compra' | 'venta' | 'molido', transactionId, opciones.datosEmision);
        await opciones.onEmitido?.();
        if (pestana) pestana.location.href = url;
        else window.open(url, '_blank', 'noopener');
      } catch (err) {
        pestana?.close();
        setError(err instanceof Error ? err.message : 'Error emitiendo el documento');
      } finally {
        setImprimiendoId(null);
      }
    },
    [],
  );

  return { imprimir, imprimiendoId, error, setError };
}
