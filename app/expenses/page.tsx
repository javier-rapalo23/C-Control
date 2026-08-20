import ExpensesPanel from '@/components/expenses-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function ExpensesPage() {
  await requireModuleAccess('expenses');

  return <ExpensesPanel />;
}
