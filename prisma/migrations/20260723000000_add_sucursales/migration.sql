-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_nombre_key" ON "Sucursal"("nombre");

-- Seed default Sucursal, used to backfill existing rows below
INSERT INTO "Sucursal" ("id", "nombre", "esPrincipal", "activo", "createdAt", "updatedAt")
VALUES ('sucursal-principal', 'Sucursal Principal', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: ProductoCarga
ALTER TABLE "ProductoCarga" ADD COLUMN "sucursalId" TEXT;
UPDATE "ProductoCarga" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "ProductoCarga" ALTER COLUMN "sucursalId" SET NOT NULL;

-- AlterTable: PurchaseTransaction
ALTER TABLE "PurchaseTransaction" ADD COLUMN "sucursalId" TEXT;
UPDATE "PurchaseTransaction" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "PurchaseTransaction" ALTER COLUMN "sucursalId" SET NOT NULL;

-- AlterTable: DailyBalance
ALTER TABLE "DailyBalance" ADD COLUMN "sucursalId" TEXT;
UPDATE "DailyBalance" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "DailyBalance" ALTER COLUMN "sucursalId" SET NOT NULL;
DROP INDEX "DailyBalance_businessDate_key";
CREATE UNIQUE INDEX "DailyBalance_businessDate_sucursalId_key" ON "DailyBalance"("businessDate", "sucursalId");

-- AlterTable: Purchase
ALTER TABLE "Purchase" ADD COLUMN "sucursalId" TEXT;
UPDATE "Purchase" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "Purchase" ALTER COLUMN "sucursalId" SET NOT NULL;

-- AlterTable: Sale
ALTER TABLE "Sale" ADD COLUMN "sucursalId" TEXT;
UPDATE "Sale" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "sucursalId" SET NOT NULL;

-- AlterTable: SaleTransaction
ALTER TABLE "SaleTransaction" ADD COLUMN "sucursalId" TEXT;
UPDATE "SaleTransaction" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "SaleTransaction" ALTER COLUMN "sucursalId" SET NOT NULL;

-- AlterTable: Expense
ALTER TABLE "Expense" ADD COLUMN "sucursalId" TEXT;
UPDATE "Expense" SET "sucursalId" = 'sucursal-principal' WHERE "sucursalId" IS NULL;
ALTER TABLE "Expense" ALTER COLUMN "sucursalId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ProductoCarga_sucursalId_idx" ON "ProductoCarga"("sucursalId");

-- CreateIndex
CREATE INDEX "PurchaseTransaction_sucursalId_idx" ON "PurchaseTransaction"("sucursalId");

-- CreateIndex
CREATE INDEX "Purchase_sucursalId_idx" ON "Purchase"("sucursalId");

-- CreateIndex
CREATE INDEX "Sale_sucursalId_idx" ON "Sale"("sucursalId");

-- CreateIndex
CREATE INDEX "SaleTransaction_sucursalId_idx" ON "SaleTransaction"("sucursalId");

-- CreateIndex
CREATE INDEX "Expense_sucursalId_idx" ON "Expense"("sucursalId");

-- AddForeignKey
ALTER TABLE "ProductoCarga" ADD CONSTRAINT "ProductoCarga_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseTransaction" ADD CONSTRAINT "PurchaseTransaction_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBalance" ADD CONSTRAINT "DailyBalance_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
