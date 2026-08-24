-- Toda compra y toda venta debe pertenecer a una transacción con cliente.
--
-- Las rutas que creaban registros huérfanos (POST /api/purchases y POST /api/sales)
-- se eliminaron; esto vuelve el invariante imposible de violar también a nivel de
-- base. Se verificó que no existía ninguna fila con NULL antes de aplicarlo: si la
-- hubiera, este ALTER falla y hay que reasignar esas filas a una transacción primero.
ALTER TABLE "Purchase" ALTER COLUMN "purchaseTransactionId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "saleTransactionId" SET NOT NULL;
