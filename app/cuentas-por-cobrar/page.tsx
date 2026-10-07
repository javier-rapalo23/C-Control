import ReceivablesPanel from '@/components/receivables-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function CuentasPorCobrarPage() {
  await requireModuleAccess('receivables');

  return <ReceivablesPanel />;
}
