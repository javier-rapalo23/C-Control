import PurchasesPanel from '@/components/purchases-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function PurchasesPage() {
  await requireModuleAccess('purchases');

  return <PurchasesPanel />;
}
