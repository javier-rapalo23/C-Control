import { notFound } from 'next/navigation';
import InvoiceA4 from '@/components/invoice-a4';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { buildInvoiceForOrigen } from '@/lib/build-invoice';
import { registrarImpresion } from '@/lib/fiscal-document';
import { prisma } from '@/lib/prisma';
import { parsePrintFormat } from '@/lib/print-formats';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string | string[] }>;
};

export default async function FacturaVentaPage({ params, searchParams }: Params) {
  const { userId } = await requireModuleAccess('sales');

  const { id } = await params;
  const formato = parsePrintFormat((await searchParams).formato);
  const data = await buildInvoiceForOrigen('venta', id);
  if (!data) notFound();

  // Abrir la hoja de un documento emitido es imprimirlo: queda en bitácora, con el
  // formato en que se abrió.
  if (data.documento) {
    await registrarImpresion(prisma, { fiscalDocumentId: data.documento.id, usuario: userId, formato });
  }

  return (
    <>
      <InvoiceToolbar />
      <InvoiceA4 data={data} formato={formato} />
    </>
  );
}
