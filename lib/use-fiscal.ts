'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { FiscalCaiDTO, FiscalDocumentDTO } from '@/types/domain';

/**
 * Documentos fiscales de una fecha y el CAI con el que se emitiría, para los paneles
 * de Compras, Ventas y Molido.
 *
 * Devuelve los documentos indexados por la transacción que amparan: cada fila del
 * panel solo tiene que buscar su id. Si no hay CAI activo del tipo, `caiActivo` queda
 * en `null` y la fila lo dice en vez de ofrecer un botón que va a fallar.
 */

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

export function useFiscal(businessDate: string, tipoDocumento: string) {
  const [documentos, setDocumentos] = useState<Record<string, FiscalDocumentDTO>>({});
  const [caiActivo, setCaiActivo] = useState<FiscalCaiDTO | null>(null);

  const refresh = useCallback(async () => {
    const [docs, cais] = await Promise.all([
      fetch(`/api/fiscal-documents?businessDate=${businessDate}`, { cache: 'no-store' }).then(
        parseApiResponse<FiscalDocumentDTO[]>,
      ),
      fetch('/api/fiscal-cais', { cache: 'no-store' }).then(parseApiResponse<FiscalCaiDTO[]>),
    ]);

    const porTransaccion: Record<string, FiscalDocumentDTO> = {};
    for (const doc of docs) {
      const id = doc.purchaseTransactionId ?? doc.saleTransactionId ?? doc.grindingServiceId;
      if (id) porTransaccion[id] = doc;
    }

    setDocumentos(porTransaccion);
    setCaiActivo(cais.find((cai) => cai.tipoDocumento === tipoDocumento && cai.estado === 'activo') ?? null);
  }, [businessDate, tipoDocumento]);

  useEffect(() => {
    // Un fallo acá no puede tumbar el panel: sin CAI configurado la operación sigue
    // como siempre, y la fila simplemente no ofrece emitir.
    void refresh().catch(() => {
      setDocumentos({});
      setCaiActivo(null);
    });
  }, [refresh]);

  return { documentos, caiActivo, refresh };
}
