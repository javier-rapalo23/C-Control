-- Traslados de efectivo entre bodegas (sucursales).
--
-- Mandar dinero de una bodega a otra se registraba como dos hechos sin relación,
-- y la que lo enviaba no lo descontaba. Un solo registro con origen y destino
-- mueve las dos cajas a la vez y se borra entero.

CREATE TABLE "CashTransfer" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "sucursalOrigenId" TEXT NOT NULL,
  "sucursalDestinoId" TEXT NOT NULL,
  "descripcion" TEXT,
  "monto" DECIMAL(12,2) NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashTransfer_pkey" PRIMARY KEY ("id"),
  -- Un traslado a la misma bodega no movería nada y solo ensuciaría el historial.
  CONSTRAINT "CashTransfer_origen_destino_check" CHECK ("sucursalOrigenId" <> "sucursalDestinoId")
);

CREATE INDEX "CashTransfer_businessDate_idx" ON "CashTransfer"("businessDate");

CREATE INDEX "CashTransfer_sucursalOrigenId_idx" ON "CashTransfer"("sucursalOrigenId");

CREATE INDEX "CashTransfer_sucursalDestinoId_idx" ON "CashTransfer"("sucursalDestinoId");

ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_sucursalOrigenId_fkey"
  FOREIGN KEY ("sucursalOrigenId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_sucursalDestinoId_fkey"
  FOREIGN KEY ("sucursalDestinoId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
