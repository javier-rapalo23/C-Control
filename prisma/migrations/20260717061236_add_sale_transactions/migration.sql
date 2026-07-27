-- AlterTable
ALTER TABLE "Producto" RENAME CONSTRAINT "Material_pkey" TO "Producto_pkey";

-- AlterTable
ALTER TABLE "ProductoCarga" RENAME CONSTRAINT "MaterialCarga_pkey" TO "ProductoCarga_pkey";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "libras" DECIMAL(10,2),
ADD COLUMN     "precioPorLibra" DECIMAL(10,2),
ADD COLUMN     "productoId" TEXT,
ADD COLUMN     "productoNombre" TEXT,
ADD COLUMN     "saleTransactionId" TEXT,
ALTER COLUMN "descripcion" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SaleTransaction" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "clientId" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleTransaction_businessDate_idx" ON "SaleTransaction"("businessDate");

-- CreateIndex
CREATE INDEX "SaleTransaction_clientId_idx" ON "SaleTransaction"("clientId");

-- CreateIndex
CREATE INDEX "Sale_productoId_idx" ON "Sale"("productoId");

-- CreateIndex
CREATE INDEX "Sale_saleTransactionId_idx" ON "Sale"("saleTransactionId");

-- RenameForeignKey
ALTER TABLE "ProductoCarga" RENAME CONSTRAINT "MaterialCarga_materialId_fkey" TO "ProductoCarga_productoId_fkey";

-- RenameForeignKey
ALTER TABLE "Purchase" RENAME CONSTRAINT "Purchase_materialId_fkey" TO "Purchase_productoId_fkey";

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_saleTransactionId_fkey" FOREIGN KEY ("saleTransactionId") REFERENCES "SaleTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Material_nombre_key" RENAME TO "Producto_nombre_key";

-- RenameIndex
ALTER INDEX "MaterialCarga_businessDate_idx" RENAME TO "ProductoCarga_businessDate_idx";

-- RenameIndex
ALTER INDEX "MaterialCarga_materialId_idx" RENAME TO "ProductoCarga_productoId_idx";
