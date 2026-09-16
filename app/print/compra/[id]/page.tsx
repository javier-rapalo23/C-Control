import { notFound } from 'next/navigation';
import InvoiceA4 from '@/components/invoice-a4';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { buildInvoiceForPurchase } from '@/lib/build-invoice';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ id: string }>;
};

export default async function FacturaCompraPage({ params }: Params) {
  // Se abre en pestaña propia, fuera del panel, así que necesita su propio control
  // de acceso: quien no pueda ver Compras tampoco puede ver una factura de compra.
  await requireModuleAccess('purchases');

  const { id } = await params;
  const data = await buildInvoiceForPurchase(id);
  if (!data) notFound();

  return (
    <>
      <InvoiceToolbar />
      <InvoiceA4 data={data} />
    </>
  );
}
