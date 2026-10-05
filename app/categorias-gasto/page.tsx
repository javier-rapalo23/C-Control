import ExpenseCategoriesPanel from '@/components/expense-categories-panel';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function ExpenseCategoriesPage() {
  await requireModuleAccess('expense_categories');

  return <ExpenseCategoriesPanel />;
}
