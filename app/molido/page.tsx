import GrindingPanel from '@/components/grinding-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function MolidoPage() {
  await requireModuleAccess('grinding');

  return <GrindingPanel />;
}
