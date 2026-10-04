'use client';

import { type PrintFormat, otherPrintFormat, printFormatLabel } from '@/lib/print-formats';
import { TIPO_DOCUMENTO_POR_ORIGEN, tipoDocumentoLabel } from '@/lib/fiscal';
import type { FiscalCaiDTO, FiscalDocumentDTO } from '@/types/domain';

/**
 * Botones de impresión del documento fiscal: el formato de siempre en el botón
 * principal y el otro al lado, para el caso suelto.
 *
 * El formato predeterminado se configura en Mantenimiento → Facturación. No son dos
 * documentos distintos: la hoja A4 y el papel continuo llevan el mismo número, el
 * mismo CAI y el mismo desglose.
 *
 * Entregar el documento fiscal es obligatorio, así que no se imprime el comprobante
 * interno: si la transacción no tiene documento, imprimir lo emite primero. En modo
 * talonario eso no se puede hacer solo —falta el número del papel—, y sin CAI activo
 * tampoco; en esos casos los botones se apagan y dicen por qué.
 */
type Props = {
  origen: 'compra' | 'venta' | 'molido';
  transactionId: string;
  formatoDefault: PrintFormat;
  imprimiendo: boolean;
  documento: FiscalDocumentDTO | null;
  caiActivo: FiscalCaiDTO | null;
  /** `emitir` es true cuando hay que emitir el documento antes de imprimirlo. */
  onImprimir: (formato: PrintFormat, emitir: boolean) => void;
  /**
   * Un solo botón, en el formato configurado, que abre la hoja en la vista previa de
   * impresión del navegador. Lo usa Compras: ahí el formato se elige en la vista previa
   * al guardar, y en la fila basta con poder volver a ver e imprimir el documento.
   */
  unSoloBoton?: boolean;
};

export default function InvoicePrintButtons({
  origen,
  transactionId,
  formatoDefault,
  imprimiendo,
  documento,
  caiActivo,
  onImprimir,
  unSoloBoton = false,
}: Props) {
  const otro = otherPrintFormat(formatoDefault);
  const tipo = tipoDocumentoLabel(TIPO_DOCUMENTO_POR_ORIGEN[origen]).toLowerCase();
  const emitir = documento === null;

  let bloqueo: string | null = null;
  if (emitir && caiActivo === null) {
    bloqueo = `No hay CAI activo de ${tipo}: no se puede emitir ni imprimir.`;
  } else if (emitir && caiActivo?.modo === 'TALONARIO') {
    bloqueo = 'Hay que emitir primero con el número del talonario; después se imprime.';
  }

  const etiqueta = emitir ? `Emitir e imprimir ${tipo}` : `Imprimir ${tipo}`;

  return (
    <>
      <button
        className="btn-primary"
        type="button"
        disabled={imprimiendo || bloqueo !== null}
        title={bloqueo ?? `${etiqueta} en ${printFormatLabel(formatoDefault)}`}
        onClick={() => onImprimir(formatoDefault, emitir)}
      >
        {imprimiendo ? (emitir ? 'Emitiendo...' : 'Imprimiendo...') : etiqueta}
      </button>
      {unSoloBoton ? null : (
        <button
          className="btn-secondary"
          type="button"
          disabled={imprimiendo || bloqueo !== null}
          title={
            bloqueo ??
            `${emitir ? 'Emitir e imprimir' : 'Imprimir'} esta vez en ${printFormatLabel(otro)}`
          }
          onClick={() => onImprimir(otro, emitir)}
          data-origen={origen}
          data-transaccion={transactionId}
        >
          {printFormatLabel(otro)}
        </button>
      )}
    </>
  );
}
