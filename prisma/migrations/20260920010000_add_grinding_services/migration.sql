-- Servicio de molido.
--
-- Se cobra por las libras molidas un monto que se escribe a mano (no hay tarifa
-- fija). Es efectivo que entra a la caja y suma al saldo del día.
CREATE TABLE "GrindingService" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "libras" DECIMAL(10,2) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrindingService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrindingService_businessDate_idx" ON "GrindingService"("businessDate");
CREATE INDEX "GrindingService_sucursalId_idx" ON "GrindingService"("sucursalId");
CREATE INDEX "GrindingService_clientId_idx" ON "GrindingService"("clientId");

ALTER TABLE "GrindingService" ADD CONSTRAINT "GrindingService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrindingService" ADD CONSTRAINT "GrindingService_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
