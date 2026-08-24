-- DropForeignKey
ALTER TABLE "EmployeeAdvance" DROP CONSTRAINT "EmployeeAdvance_payrollPaymentId_fkey";

-- DropIndex
DROP INDEX "EmployeeAdvance_payrollPaymentId_idx";

-- AlterTable
ALTER TABLE "EmployeeAdvance" DROP COLUMN "payrollPaymentId";

-- CreateTable
CREATE TABLE "PayrollAdvanceApplication" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdvanceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollAdvanceApplication_advanceId_idx" ON "PayrollAdvanceApplication"("advanceId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAdvanceApplication_paymentId_advanceId_key" ON "PayrollAdvanceApplication"("paymentId", "advanceId");

-- AddForeignKey
ALTER TABLE "PayrollAdvanceApplication" ADD CONSTRAINT "PayrollAdvanceApplication_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "EmployeePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdvanceApplication" ADD CONSTRAINT "PayrollAdvanceApplication_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

