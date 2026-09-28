'use client';

import { type PrintFormat, otherPrintFormat, printFormatLabel } from '@/lib/print-formats';

/**
 * Botones de impresión de la factura: el formato de siempre en el botón principal y
 * el otro al lado, para el caso suelto.
 *
 * El formato predeterminado se configura en Mantenimiento → Facturación. No son dos
 * documentos distintos: el ticket de 80 mm y la hoja A4 llevan el mismo número, el
 * mismo CAI y el mismo desglose.
 */
type Props = {
  origen: 'compra' | 'venta' | 'molido';
  transactionId: string;
  formatoDefault: PrintFormat;
  imprimiendo: boolean;
  onImprimir: (formato: PrintFormat) => void;
};

export default function InvoicePrintButtons({
  origen,
  transactionId,
  formatoDefault,
  imprimiendo,
  onImprimir,
}: Props) {
  const otro = otherPrintFormat(formatoDefault);

  return (
    <>
      <button
        className="btn-primary"
        type="button"
        disabled={imprimiendo}
        title={`Imprimir en ${printFormatLabel(formatoDefault)}`}
        onClick={() => onImprimir(formatoDefault)}
      >
        {imprimiendo ? 'Imprimiendo...' : 'Imprimir factura'}
      </button>
      <button
        className="btn-secondary"
        type="button"
        disabled={imprimiendo}
        title={`Imprimir esta vez en ${printFormatLabel(otro)}`}
        onClick={() => onImprimir(otro)}
        data-origen={origen}
        data-transaccion={transactionId}
      >
        {printFormatLabel(otro)}
      </button>
    </>
  );
}
