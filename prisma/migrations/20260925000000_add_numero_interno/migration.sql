-- Correlativo interno del comprobante, en serie propia para compras y para ventas.
--
-- `numeroFactura` es el talonario físico y puede venir vacío, así que no servía
-- para identificar un comprobante ni para casar la copia del cliente con la del
-- control interno. Lo asigna una secuencia de la base y no la aplicación: dos
-- transacciones guardadas a la vez no pueden recibir el mismo número.

-- Compras --------------------------------------------------------------------

ALTER TABLE "PurchaseTransaction" ADD COLUMN "numeroInterno" INTEGER;

-- Las compras ya registradas se numeran en el orden en que se guardaron, que es
-- el orden en que se facturaron.
WITH ordenadas AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS "correlativo"
  FROM "PurchaseTransaction"
)
UPDATE "PurchaseTransaction" AS pt
SET "numeroInterno" = ordenadas."correlativo"
FROM ordenadas
WHERE pt."id" = ordenadas."id";

CREATE SEQUENCE "PurchaseTransaction_numeroInterno_seq"
  OWNED BY "PurchaseTransaction"."numeroInterno";

SELECT setval(
  '"PurchaseTransaction_numeroInterno_seq"',
  COALESCE((SELECT MAX("numeroInterno") FROM "PurchaseTransaction"), 0) + 1,
  false
);

ALTER TABLE "PurchaseTransaction"
  ALTER COLUMN "numeroInterno" SET DEFAULT nextval('"PurchaseTransaction_numeroInterno_seq"'),
  ALTER COLUMN "numeroInterno" SET NOT NULL;

CREATE UNIQUE INDEX "PurchaseTransaction_numeroInterno_key"
  ON "PurchaseTransaction"("numeroInterno");

-- Ventas ---------------------------------------------------------------------

ALTER TABLE "SaleTransaction" ADD COLUMN "numeroInterno" INTEGER;

WITH ordenadas AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS "correlativo"
  FROM "SaleTransaction"
)
UPDATE "SaleTransaction" AS st
SET "numeroInterno" = ordenadas."correlativo"
FROM ordenadas
WHERE st."id" = ordenadas."id";

CREATE SEQUENCE "SaleTransaction_numeroInterno_seq"
  OWNED BY "SaleTransaction"."numeroInterno";

SELECT setval(
  '"SaleTransaction_numeroInterno_seq"',
  COALESCE((SELECT MAX("numeroInterno") FROM "SaleTransaction"), 0) + 1,
  false
);

ALTER TABLE "SaleTransaction"
  ALTER COLUMN "numeroInterno" SET DEFAULT nextval('"SaleTransaction_numeroInterno_seq"'),
  ALTER COLUMN "numeroInterno" SET NOT NULL;

CREATE UNIQUE INDEX "SaleTransaction_numeroInterno_key"
  ON "SaleTransaction"("numeroInterno");
