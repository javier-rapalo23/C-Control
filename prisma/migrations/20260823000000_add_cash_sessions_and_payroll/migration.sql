-- AlterTable
-- RENAME en vez del DROP + ADD que genera Prisma por defecto: así se conserva el
-- valor ya capturado para cada empleado. OJO: el campo pasa a significar pago POR
-- DÍA, de modo que los valores existentes deben revisarse antes de correr planilla.
ALTER TABLE "Employee" RENAME COLUMN "salario" TO "salarioDiario";

-- AlterTable
ALTER TABLE "EmployeeAdvance" ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "montoAplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payrollPaymentId" TEXT,
ADD COLUMN     "sucursalId" TEXT;

-- AlterTable
ALTER TABLE "EmployeePayment" ADD COLUMN     "adelantosAplicados" DECIMAL(12,2),
ADD COLUMN     "diasTrabajados" INTEGER,
ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "periodoFin" DATE,
ADD COLUMN     "periodoInicio" DATE,
ADD COLUMN     "salarioDiario" DECIMAL(12,2),
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "sucursalId" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "montoApertura" DECIMAL(12,2) NOT NULL,
    "abiertaPor" TEXT NOT NULL,
    "abiertaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoContado" DECIMAL(12,2),
    "saldoEsperado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "cerradaPor" TEXT,
    "cerradaAt" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashSession_businessDate_idx" ON "CashSession"("businessDate");

-- CreateIndex
CREATE INDEX "CashSession_sucursalId_idx" ON "CashSession"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_businessDate_sucursalId_key" ON "CashSession"("businessDate", "sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAdvance_expenseId_key" ON "EmployeeAdvance"("expenseId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_payrollPaymentId_idx" ON "EmployeeAdvance"("payrollPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayment_expenseId_key" ON "EmployeePayment"("expenseId");

-- CreateIndex
CREATE INDEX "EmployeePayment_employeeId_periodoInicio_periodoFin_idx" ON "EmployeePayment"("employeeId", "periodoInicio", "periodoFin");

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_payrollPaymentId_fkey" FOREIGN KEY ("payrollPaymentId") REFERENCES "EmployeePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

