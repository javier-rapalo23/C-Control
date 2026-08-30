-- Catálogo de bancos y categorías de gasto cerradas.
--
-- `Expense.categoria` era texto libre, así que "gasolina", "Gasolina" y "GASOLINA"
-- convivían y agrupar el gasto por categoría era imposible. A partir de aquí el
-- valor sale de un catálogo fijo (`lib/expenses.ts`) y el pago a banco apunta a un
-- registro de `Banco` en vez de llevar el nombre escrito a mano.

CREATE TABLE "Banco" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Banco_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Banco_nombre_key" ON "Banco"("nombre");

ALTER TABLE "Expense" ADD COLUMN "bancoId" TEXT;

CREATE INDEX "Expense_bancoId_idx" ON "Expense"("bancoId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bancoId_fkey"
  FOREIGN KEY ("bancoId") REFERENCES "Banco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los gastos ya registrados con una categoría fuera del catálogo pasan a "Varios".
-- La categoría original se antepone a la descripción en vez de descartarse: sigue
-- siendo el único dato que dice qué era ese gasto.
UPDATE "Expense"
SET "descripcion" = "categoria" || ' - ' || "descripcion",
    "categoria" = 'Varios'
WHERE "categoria" NOT IN ('Gasolina', 'Planilla', 'Pago banco', 'Pago tarjeta', 'Varios');
