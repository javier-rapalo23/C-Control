-- Tipo de cliente: de compra, de venta o ambos.
--
-- Los clientes existentes quedan como de compra. Los que ya tienen ventas registradas
-- quedan además como de venta, para que no desaparezcan del selector de Ventas. El
-- cliente general sirve para las dos cosas.

ALTER TABLE "Client" ADD COLUMN "esCompra" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN "esVenta" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Client" SET "esVenta" = true
WHERE "esGeneral" = true
   OR EXISTS (SELECT 1 FROM "SaleTransaction" s WHERE s."clientId" = "Client"."id");
