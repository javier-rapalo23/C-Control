-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "factorConversionOro" DECIMAL(6,4),
ADD COLUMN     "taraPorSaco" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "numeroSacos" INTEGER,
ADD COLUMN     "pesoBruto" DECIMAL(10,2),
ADD COLUMN     "quintalesOro" DECIMAL(10,2),
ADD COLUMN     "taraPorSaco" DECIMAL(6,2);
