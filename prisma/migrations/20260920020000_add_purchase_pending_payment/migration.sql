-- Compras con pago pendiente.
--
-- Una compra puede registrarse hoy y pagarse otro día. Se marca con
-- `metodoPago = 'pendiente'` (no resta de la caja del día de la compra) y, al
-- pagarse, estas columnas guardan la fecha de caja y la forma del pago. Si fue en
-- efectivo, resta del saldo de `pagoFecha`.
ALTER TABLE "PurchaseTransaction" ADD COLUMN "pagoFecha" DATE;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "pagoMetodo" TEXT;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "pagoRegistradoPor" TEXT;
ALTER TABLE "PurchaseTransaction" ADD COLUMN "pagadoEn" TIMESTAMP(3);

CREATE INDEX "PurchaseTransaction_pagoFecha_idx" ON "PurchaseTransaction"("pagoFecha");
