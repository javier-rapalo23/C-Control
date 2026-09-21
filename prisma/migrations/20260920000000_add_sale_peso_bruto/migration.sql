-- Pesaje en ventas, igual que en compras.
--
-- La venta se captura ahora como la compra: peso bruto, sacos y tara por saco, y
-- `libras` guarda el peso neto resultante. Las columnas son opcionales porque
-- las ventas anteriores se registraron directamente en libras.
ALTER TABLE "Sale" ADD COLUMN "pesoBruto" DECIMAL(10,2);
ALTER TABLE "Sale" ADD COLUMN "numeroSacos" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "taraPorSaco" DECIMAL(6,2);
