import ReportsPanel from '@/components/reports-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function ReportsPage() {
  await requireModuleAccess('reports');

  return <ReportsPanel />;
}
