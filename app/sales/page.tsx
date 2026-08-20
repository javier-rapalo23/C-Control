import SalesPanel from '@/components/sales-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function SalesPage() {
  await requireModuleAccess('sales');

  return <SalesPanel />;
}
