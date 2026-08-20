import SucursalesPanel from '@/components/sucursales-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function SucursalesPage() {
  await requireModuleAccess('sucursales');

  return <SucursalesPanel />;
}
