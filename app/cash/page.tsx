import CashSessionPanel from '@/components/cash-session-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function CashPage() {
  await requireModuleAccess('cash');

  return (
    <main className="page-shell">
      <h1>Caja</h1>
      <p>Apertura y cierre del efectivo del día, con el arqueo contra el saldo esperado.</p>

      <CashSessionPanel />
    </main>
  );
}
