-- Número del talonario físico, capturado a mano en la cabecera de la compra.
-- Nullable: las compras ya registradas no lo tienen y no hay de dónde deducirlo.
ALTER TABLE "PurchaseTransaction" ADD COLUMN "numeroFactura" TEXT;

-- Base para facturar con factura autorizada (SAR) sin activarlo todavía. La
-- factura A4 imprime el bloque fiscal solo si "cai" tiene valor, de modo que
-- activarlo después es llenar estos campos desde Mantenimiento > Empresa.
ALTER TABLE "CompanySettings" ADD COLUMN "cai" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanySettings" ADD COLUMN "facturaRangoDesde" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanySettings" ADD COLUMN "facturaRangoHasta" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanySettings" ADD COLUMN "facturaFechaLimite" TEXT NOT NULL DEFAULT '';
