import { notFound } from 'next/navigation';
import InvoiceA4 from '@/components/invoice-a4';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { buildInvoiceFromDocument } from '@/lib/build-invoice';
import { registrarImpresion } from '@/lib/fiscal-document';
import { prisma } from '@/lib/prisma';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * Hoja A4 de una nota de crédito o débito. El id es **el del documento**: una nota no
 * ampara ninguna transacción, así que no existe un `/print/compra/:id` equivalente.
 *
 * El permiso que pide es el del módulo del documento corregido —Compras si la nota es
 * sobre una compra, Ventas si es sobre una venta o un molido—, con el mismo criterio que
 * las otras páginas de impresión: quien no puede ver Compras no puede ver el papel de
 * una compra. Para saber cuál es hay que leer la nota primero; la lectura no muestra
 * nada, la autorización ocurre antes de renderizar.
 */
export default async function NotaFiscalPage({ params }: Params) {
  const { id } = await params;
  const data = await buildInvoiceFromDocument(id);
  // Solo notas: la factura de una compra se imprime desde `/print/compra/:id`, que sabe
  // resolver el caso de que todavía no esté emitida.
  if (!data || data.kind !== 'nota') notFound();

  const { userId } = await requireModuleAccess(data.notaSobre === 'compra' ? 'purchases' : 'sales');

  if (data.documento) {
    await registrarImpresion(prisma, { fiscalDocumentId: data.documento.id, usuario: userId, formato: 'a4' });
  }

  return (
    <>
      <InvoiceToolbar />
      <InvoiceA4 data={data} />
    </>
  );
}
