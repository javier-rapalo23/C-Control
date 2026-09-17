-- Salidas de efectivo.
--
-- Contraparte de "CashEntry": no había forma de registrar que salió dinero de la
-- caja sin ser una compra ni un gasto (retiro del dueño, depósito del sobrante al
-- banco), así que el arqueo daba un faltante que en realidad no existía.

CREATE TABLE "CashWithdrawal" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "sucursalId" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashWithdrawal_businessDate_idx" ON "CashWithdrawal"("businessDate");

CREATE INDEX "CashWithdrawal_sucursalId_idx" ON "CashWithdrawal"("sucursalId");

ALTER TABLE "CashWithdrawal" ADD CONSTRAINT "CashWithdrawal_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
