import InventoryPanel from '@/components/inventory-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function InventoryPage() {
  await requireModuleAccess('inventory');

  return <InventoryPanel />;
}
