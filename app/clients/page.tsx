import ClientsPanel from '@/components/clients-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function ClientsPage() {
  await requireModuleAccess('clients');

  return <ClientsPanel />;
}
