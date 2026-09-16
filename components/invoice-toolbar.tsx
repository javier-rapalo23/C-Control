'use client';

import { Printer } from 'lucide-react';

/**
 * Barra de la página de factura. No se imprime: el CSS de `invoice-a4.tsx` la
 * oculta junto con el resto del documento.
 *
 * No dispara `window.print()` al cargar a propósito. La factura lleva el monto que
 * se le paga al productor, así que conviene que se vea en pantalla antes de gastar
 * papel; el diálogo se abre cuando el usuario lo pide.
 */
export default function InvoiceToolbar() {
  return (
    <div className="invoice-toolbar">
      <button className="btn-primary" type="button" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" />
        Imprimir
      </button>
    </div>
  );
}
