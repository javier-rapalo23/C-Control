import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Categorías de gasto.
 *
 * Antes `Expense.categoria` era texto libre, así que "gasolina", "Gasolina" y
 * "GASOLINA" convivían y agrupar por categoría en un reporte era imposible. Sigue
 * siendo un catálogo cerrado, pero vive en la tabla `ExpenseCategory` y se
 * administra desde Mantenimiento → Categorías de gasto.
 */

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Categoría de los gastos que genera la planilla; permite reconocerlos después.
 * Es una categoría `sistema`: el código la escribe por nombre, así que no se
 * puede renombrar ni eliminar.
 */
export const PAYROLL_EXPENSE_CATEGORY = 'Planilla';

export const DEFAULT_EXPENSE_CATEGORIA = 'Varios';

export class ExpenseCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpenseCategoryError';
  }
}

/**
 * Comprueba que la categoría pueda usarse en un gasto registrado a mano y que el
 * banco venga solo cuando la categoría lo pide. Devuelve la categoría.
 *
 * No va en el esquema de zod porque depende del catálogo en la base.
 */
export async function assertManualExpenseCategory(
  db: DbClient,
  input: { categoria: string; bancoId?: string | null },
) {
  const category = await db.expenseCategory.findUnique({ where: { nombre: input.categoria } });

  if (!category || !category.activo) {
    throw new ExpenseCategoryError(`La categoría "${input.categoria}" no existe o está inactiva`);
  }

  // "Planilla" la escribe el módulo Personal junto al pago o anticipo que la
  // origina; uno creado a mano quedaría sin esa contrapartida.
  if (category.sistema) {
    throw new ExpenseCategoryError(`La categoría "${category.nombre}" la registra el sistema`);
  }

  // Se exige banco solo donde se pide y se rechaza en el resto, para que no queden
  // pagos de banco sin banco ni gasolina colgando de uno.
  if (category.requiereBanco && !input.bancoId) {
    throw new ExpenseCategoryError('Seleccione el banco al que corresponde el pago');
  }
  if (!category.requiereBanco && input.bancoId) {
    throw new ExpenseCategoryError(`La categoría "${category.nombre}" no lleva banco`);
  }

  return category;
}
