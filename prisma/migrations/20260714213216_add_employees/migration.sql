-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT,
    "telefono" TEXT,
    "salario" DECIMAL(12,2),
    "fechaIngreso" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayment" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNombre" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeePayment_businessDate_idx" ON "EmployeePayment"("businessDate");

-- CreateIndex
CREATE INDEX "EmployeePayment_employeeId_idx" ON "EmployeePayment"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
