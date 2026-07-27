-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNombre" TEXT NOT NULL,
    "horaEntrada" TEXT,
    "horaSalida" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNombre" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_businessDate_employeeId_key" ON "Attendance"("businessDate", "employeeId");

-- CreateIndex
CREATE INDEX "Attendance_businessDate_idx" ON "Attendance"("businessDate");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_businessDate_idx" ON "EmployeeAdvance"("businessDate");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_employeeId_idx" ON "EmployeeAdvance"("employeeId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
