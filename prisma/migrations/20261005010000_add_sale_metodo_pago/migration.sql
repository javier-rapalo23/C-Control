-- Forma de pago de una venta.
--
-- Hasta aquí toda venta sumaba al efectivo de la caja. Con la forma de pago, igual que
-- en compras, solo la venta cobrada en efectivo entra a la gaveta: un depósito o un
-- cheque quedan registrados y facturados, pero no suman al saldo del día.
--
-- Las ventas ya registradas pasan a `efectivo`, que es como se venían contando: el
-- saldo histórico no cambia.

ALTER TABLE "SaleTransaction" ADD COLUMN "metodoPago" TEXT NOT NULL DEFAULT 'efectivo';
