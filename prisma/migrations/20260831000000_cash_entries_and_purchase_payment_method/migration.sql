-- Ingresos de efectivo y forma de pago de la compra.
--
-- Faltaban las dos puntas del efectivo que no viene de una venta ni sale por un
-- gasto: no había forma de registrar que entró dinero a la caja (reposición,
-- retiro del banco), y toda compra restaba del saldo aunque se hubiera pagado
-- con cheque o depósito, es decir, sin tocar la gaveta.

CREATE TABLE "CashEntry" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "sucursalId" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashEntry_businessDate_idx" ON "CashEntry"("businessDate");

CREATE INDEX "CashEntry_sucursalId_idx" ON "CashEntry"("sucursalId");

ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El default deja las compras ya registradas como "efectivo", que es exactamente
-- como se venían contando contra la caja: ningún saldo histórico se mueve.
ALTER TABLE "PurchaseTransaction" ADD COLUMN "metodoPago" TEXT NOT NULL DEFAULT 'efectivo';
