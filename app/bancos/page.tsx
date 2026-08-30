import BancosPanel from '@/components/bancos-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function BancosPage() {
  await requireModuleAccess('bancos');

  return <BancosPanel />;
}
