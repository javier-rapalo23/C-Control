import { notFound } from 'next/navigation';
import InvoiceA4 from '@/components/invoice-a4';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { buildInvoiceForSale } from '@/lib/build-invoice';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

export default async function FacturaVentaPage({ params }: Params) {
  await requireModuleAccess('sales');

  const { id } = await params;
  const data = await buildInvoiceForSale(id);
  if (!data) notFound();

  return (
    <>
      <InvoiceToolbar />
      <InvoiceA4 data={data} />
    </>
  );
}
