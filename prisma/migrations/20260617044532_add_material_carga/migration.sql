-- AlterTable
ALTER TABLE "CompanySettings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "MaterialCarga" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "materialId" TEXT NOT NULL,
    "materialNombre" TEXT NOT NULL,
    "libras" DECIMAL(10,2),
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCarga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialCarga_businessDate_idx" ON "MaterialCarga"("businessDate");

-- CreateIndex
CREATE INDEX "MaterialCarga_materialId_idx" ON "MaterialCarga"("materialId");

-- AddForeignKey
ALTER TABLE "MaterialCarga" ADD CONSTRAINT "MaterialCarga_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
