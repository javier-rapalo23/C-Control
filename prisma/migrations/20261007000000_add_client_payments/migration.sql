-- Cuentas por cobrar de ventas.
--
-- Una venta con `metodoPago = 'credito'` no se cobra al registrarse: queda como cuenta
-- por cobrar del cliente y se liquida con abonos, que pueden llegar por partes (un
-- depósito hoy, otro la semana siguiente). Un abono es del cliente y se reparte entre
-- sus ventas a crédito en `ClientPaymentApplication`.
--
-- Las ventas ya registradas no cambian: ninguna es a crédito.

CREATE TABLE "ClientPayment" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClientPayment_monto_positivo" CHECK ("monto" > 0)
);

CREATE TABLE "ClientPaymentApplication" (
    "id" TEXT NOT NULL,
    "clientPaymentId" TEXT NOT NULL,
    "saleTransactionId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ClientPaymentApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClientPaymentApplication_monto_positivo" CHECK ("monto" > 0)
);

CREATE INDEX "ClientPayment_businessDate_idx" ON "ClientPayment"("businessDate");
CREATE INDEX "ClientPayment_clientId_idx" ON "ClientPayment"("clientId");
CREATE INDEX "ClientPayment_sucursalId_idx" ON "ClientPayment"("sucursalId");
CREATE INDEX "ClientPaymentApplication_clientPaymentId_idx" ON "ClientPaymentApplication"("clientPaymentId");
CREATE INDEX "ClientPaymentApplication_saleTransactionId_idx" ON "ClientPaymentApplication"("saleTransactionId");

ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPaymentApplication" ADD CONSTRAINT "ClientPaymentApplication_clientPaymentId_fkey"
  FOREIGN KEY ("clientPaymentId") REFERENCES "ClientPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPaymentApplication" ADD CONSTRAINT "ClientPaymentApplication_saleTransactionId_fkey"
  FOREIGN KEY ("saleTransactionId") REFERENCES "SaleTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
