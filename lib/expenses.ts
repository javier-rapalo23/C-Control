/**
 * Catálogo de categorías de gasto.
 *
 * Antes `Expense.categoria` era texto libre, así que "gasolina", "Gasolina" y
 * "GASOLINA" convivían y agrupar por categoría en un reporte era imposible. El
 * catálogo es cerrado por eso, y el valor guardado es la etiqueta misma: los
 * gastos ya registrados con una categoría del catálogo siguen siendo válidos.
 */

/** Categoría de los gastos que genera la planilla; permite reconocerlos después. */
export const PAYROLL_EXPENSE_CATEGORY = 'Planilla';

/** Categoría que exige indicar el banco, para poder desglosar el gasto por banco. */
export const BANK_EXPENSE_CATEGORY = 'Pago banco';

/** Igual que la anterior: una tarjeta pertenece a un banco y el pago se desglosa con él. */
export const CARD_EXPENSE_CATEGORY = 'Pago tarjeta';

export const EXPENSE_CATEGORIA_VALUES = [
  'Gasolina',
  // Servicios del local. Tienen categoría propia y no "Varios" porque son fijos
  // y mensuales: mezclados en "Varios" no se podía ver cuánto se va en ellos.
  'Energía',
  'Agua',
  'Alquiler',
  PAYROLL_EXPENSE_CATEGORY,
  BANK_EXPENSE_CATEGORY,
  CARD_EXPENSE_CATEGORY,
  // Cabulla, sacos, básculas y todo lo que no amerita categoría propia: el detalle
  // vive en la descripción.
  'Varios',
] as const;

export type ExpenseCategoria = (typeof EXPENSE_CATEGORIA_VALUES)[number];

export type ExpenseCategoriaDef = {
  value: ExpenseCategoria;
  label: string;
  /** La escribe el sistema, no el usuario. */
  auto?: boolean;
  requiereBanco?: boolean;
};

export const EXPENSE_CATEGORIES: ExpenseCategoriaDef[] = [
  { value: 'Gasolina', label: 'Gasolina' },
  { value: 'Energía', label: 'Energía' },
  { value: 'Agua', label: 'Agua' },
  { value: 'Alquiler', label: 'Alquiler' },
  // La planilla la escribe el módulo Personal junto al pago o anticipo que la
  // origina; elegirla a mano crearía un gasto sin esa contrapartida.
  { value: PAYROLL_EXPENSE_CATEGORY, label: 'Planilla (automática)', auto: true },
  { value: BANK_EXPENSE_CATEGORY, label: 'Pago banco', requiereBanco: true },
  { value: CARD_EXPENSE_CATEGORY, label: 'Pago tarjeta', requiereBanco: true },
  { value: 'Varios', label: 'Varios' },
];

/** Las que llevan banco. El desglose por banco del reporte de gastos suma todas. */
export const BANK_LINKED_CATEGORIES: readonly ExpenseCategoria[] = EXPENSE_CATEGORIES.filter(
  (category) => category.requiereBanco,
).map((category) => category.value);

/** Las que un usuario puede elegir en el panel de gastos. */
export const MANUAL_EXPENSE_CATEGORIES: ExpenseCategoriaDef[] = EXPENSE_CATEGORIES.filter(
  (category) => !category.auto,
);

/** Tupla no vacía, que es lo que `z.enum` necesita. */
export const MANUAL_EXPENSE_CATEGORIA_VALUES = MANUAL_EXPENSE_CATEGORIES.map(
  (category) => category.value,
) as [ExpenseCategoria, ...ExpenseCategoria[]];

export const DEFAULT_EXPENSE_CATEGORIA: ExpenseCategoria = 'Varios';

/**
 * Se deriva del catálogo y no de una comparación suelta: cuando "Pago tarjeta"
 * pasó a llevar banco, el único cambio fue su `requiereBanco`, y el formulario,
 * la validación y el reporte lo siguieron solos.
 */
export function requiresBanco(categoria: string): boolean {
  return EXPENSE_CATEGORIES.find((category) => category.value === categoria)?.requiereBanco === true;
}
