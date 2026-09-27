-- Bono y descuento al pie de la factura de compra.
--
-- `PurchaseTransaction.total` pasa a ser lo que se le paga al productor
-- (líneas + bono − descuento). Las compras existentes no llevan ajustes, así que
-- con el default 0 su total sigue siendo exactamente el mismo.
ALTER TABLE "PurchaseTransaction" ADD COLUMN "bono" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "bonoMotivo" TEXT;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "descuentoMotivo" TEXT;
