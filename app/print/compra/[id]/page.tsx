import { notFound } from 'next/navigation';
import InvoiceA4 from '@/components/invoice-a4';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { buildInvoiceForOrigen } from '@/lib/build-invoice';
import { registrarImpresion } from '@/lib/fiscal-document';
import { prisma } from '@/lib/prisma';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

export default async function FacturaCompraPage({ params }: Params) {
  // Se abre en pestaña propia, fuera del panel, así que necesita su propio control
  // de acceso: quien no pueda ver Compras tampoco puede ver una factura de compra.
  const { userId } = await requireModuleAccess('purchases');

  const { id } = await params;
  // Con documento fiscal emitido imprime el snapshot; si no, los datos vivos como
  // comprobante interno. El enlace es el mismo en los dos casos.
  const data = await buildInvoiceForOrigen('compra', id);
  if (!data) notFound();

  // Abrir la hoja de un documento emitido es imprimirlo: queda en bitácora, con el
  // formato, igual que el ticket de 80 mm.
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
