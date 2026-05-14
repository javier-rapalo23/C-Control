-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "rtn" TEXT,
    "cuentaBancaria" TEXT,
    "notas" TEXT,
    "esGeneral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseTransaction" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "clientId" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseTransaction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "purchaseTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_nombre_key" ON "Client"("nombre");

-- CreateIndex
CREATE INDEX "PurchaseTransaction_businessDate_idx" ON "PurchaseTransaction"("businessDate");

-- CreateIndex
CREATE INDEX "PurchaseTransaction_clientId_idx" ON "PurchaseTransaction"("clientId");

-- CreateIndex
CREATE INDEX "Purchase_purchaseTransactionId_idx" ON "Purchase"("purchaseTransactionId");

-- AddForeignKey
ALTER TABLE "PurchaseTransaction" ADD CONSTRAINT "PurchaseTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_purchaseTransactionId_fkey" FOREIGN KEY ("purchaseTransactionId") REFERENCES "PurchaseTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
