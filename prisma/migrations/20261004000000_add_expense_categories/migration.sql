-- Catálogo de categorías de gasto administrable.
--
-- Hasta aquí el catálogo vivía fijo en `lib/expenses.ts`. Pasa a una tabla para
-- poder agregar, renombrar o desactivar categorías desde Mantenimiento. El gasto
-- sigue guardando el nombre, ahora con llave foránea: renombrar una categoría
-- actualiza en cascada los gastos ya registrados y no se puede borrar una en uso.

CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "requiereBanco" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "sistema" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseCategory_nombre_key" ON "ExpenseCategory"("nombre");

-- El catálogo que estaba en código.
INSERT INTO "ExpenseCategory" ("id", "nombre", "requiereBanco", "activo", "sistema", "updatedAt") VALUES
  ('expcat-gasolina', 'Gasolina', false, true, false, CURRENT_TIMESTAMP),
  ('expcat-energia', 'Energía', false, true, false, CURRENT_TIMESTAMP),
  ('expcat-agua', 'Agua', false, true, false, CURRENT_TIMESTAMP),
  ('expcat-alquiler', 'Alquiler', false, true, false, CURRENT_TIMESTAMP),
  ('expcat-planilla', 'Planilla', false, true, true, CURRENT_TIMESTAMP),
  ('expcat-pago-banco', 'Pago banco', true, true, false, CURRENT_TIMESTAMP),
  ('expcat-pago-tarjeta', 'Pago tarjeta', true, true, false, CURRENT_TIMESTAMP),
  ('expcat-varios', 'Varios', false, true, false, CURRENT_TIMESTAMP);

-- Cualquier categoría ya usada que no esté arriba se conserva (inactiva) en vez
-- de reescribir gastos: la llave foránea no se podría crear sin ella.
INSERT INTO "ExpenseCategory" ("id", "nombre", "activo", "updatedAt")
SELECT 'expcat-' || md5("categoria"), "categoria", false, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "categoria" FROM "Expense") AS usadas
ON CONFLICT ("nombre") DO NOTHING;

CREATE INDEX "Expense_categoria_idx" ON "Expense"("categoria");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoria_fkey"
  FOREIGN KEY ("categoria") REFERENCES "ExpenseCategory"("nombre") ON DELETE RESTRICT ON UPDATE CASCADE;
