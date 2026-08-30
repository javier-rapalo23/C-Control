-- Cada empleado pertenece a una sucursal.
--
-- Se hace en tres pasos en vez del ADD COLUMN ... NOT NULL que genera Prisma por
-- defecto: ese fallaría con empleados ya existentes. Los que había se asignan a la
-- sucursal principal (o a la más antigua si ninguna lo es); reasignarlos después
-- es un cambio de un campo en Mantenimiento > Personal.
ALTER TABLE "Employee" ADD COLUMN "sucursalId" TEXT;

UPDATE "Employee"
SET "sucursalId" = (
  SELECT "id" FROM "Sucursal" ORDER BY "esPrincipal" DESC, "createdAt" ASC LIMIT 1
)
WHERE "sucursalId" IS NULL;

ALTER TABLE "Employee" ALTER COLUMN "sucursalId" SET NOT NULL;

CREATE INDEX "Employee_sucursalId_idx" ON "Employee"("sucursalId");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
