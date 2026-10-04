'use client';

import InvoiceA4 from '@/components/invoice-a4';
import type { InvoiceData } from '@/lib/build-invoice';
import { PRINT_FORMATS, type PrintFormat, printFormatLabel } from '@/lib/print-formats';

/** Lo que devuelve `POST /api/purchase-transactions/preview`. */
export type PurchasePreview = {
  invoice: InvoiceData;
  /** Si al confirmar se emite la boleta. */
  emitira: boolean;
  /** Por qué no se emite; null si se emite. */
  motivoNoEmite: string | null;
};

type Props = {
  preview: PurchasePreview | null;
  formato: PrintFormat;
  onFormatoChange: (formato: PrintFormat) => void;
  guardando: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Vista previa de la boleta de compra antes de guardar.
 *
 * Es el último punto donde corregir es gratis: después de confirmar, la compra queda
 * guardada y la boleta consume un número del CAI, que solo se deshace anulando. Por eso
 * se muestra el documento tal como va a salir —mismo armado, mismo formato— y no un
 * resumen del carrito.
 */
export default function PurchasePreviewModal({
  preview,
  formato,
  onFormatoChange,
  guardando,
  error,
  onClose,
  onConfirm,
}: Props) {
  if (!preview) return null;

  const cerrar = guardando ? undefined : onClose;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onClick={cerrar}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-preview-title"
        style={{
          width: '100%',
          maxWidth: 900,
          margin: 0,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 id="purchase-preview-title" style={{ margin: 0 }}>
            Revisar la compra antes de guardar
          </h3>
          {/* Se revisa en el formato en que se va a imprimir; cambiarlo aquí cambia
              también con qué se imprime al confirmar. */}
          <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Formato de impresión">
            {PRINT_FORMATS.map((opcion) => (
              <button
                key={opcion.key}
                type="button"
                className={formato === opcion.key ? 'btn-primary' : 'btn-secondary'}
                onClick={() => onFormatoChange(opcion.key)}
                disabled={guardando}
                aria-pressed={formato === opcion.key}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                {opcion.label}
              </button>
            ))}
          </div>
        </div>

        {preview.emitira ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-soft)' }}>
            Al confirmar se guarda la compra, se emite la boleta de compra y se imprime en{' '}
            <strong>{printFormatLabel(formato)}</strong>.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
            Se va a guardar <strong>sin boleta</strong>: {preview.motivoNoEmite} Quedará en &quot;Pendientes de
            emitir&quot;.
          </p>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            background: 'var(--surface-alt)',
            borderRadius: 'var(--radius)',
            padding: '0 8px',
          }}
        >
          <InvoiceA4 data={preview.invoice} formato={formato} vistaPrevia />
        </div>

        {error ? <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{error}</p> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={guardando}>
            Corregir
          </button>
          <button className="btn-primary" type="button" onClick={onConfirm} disabled={guardando}>
            {guardando ? 'Guardando…' : preview.emitira ? 'Guardar e imprimir' : 'Guardar sin boleta'}
          </button>
        </div>
      </div>
    </div>
  );
}
