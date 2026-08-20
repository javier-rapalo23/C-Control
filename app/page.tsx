import DashboardHome from '@/components/dashboard-home';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function HomePage() {
  await requireModuleAccess('dashboard', '/purchases');

  return <DashboardHome />;
}
