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

export default async function FacturaMolidoPage({ params }: Params) {
  const { userId } = await requireModuleAccess('grinding');

  const { id } = await params;
  const data = await buildInvoiceForOrigen('molido', id);
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
