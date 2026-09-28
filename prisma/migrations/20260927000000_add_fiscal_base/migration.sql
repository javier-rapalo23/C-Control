-- Base de la facturación fiscal (SAR): CAI administrable, documento emitido con
-- snapshot inmutable y bitácora. Todavía no emite nada: esta migración solo crea
-- el modelo (Fase 1 de docs/facturacion-sar-plan.md).
--
-- Es aditiva: ninguna columna existente cambia de tipo ni se borra, así que un
-- despliegue viejo sigue funcionando contra esta base.

-- Clasificación para el ISV. El café está exonerado, así que el default deja a
-- todos los productos como exentos y nadie tiene que tocarlos.
ALTER TABLE "Producto" ADD COLUMN "clasificacionFiscal" TEXT NOT NULL DEFAULT 'EXENTO';

CREATE TABLE "FiscalCai" (
  "id" TEXT NOT NULL,
  "tipoDocumento" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "codigoEstablecimiento" TEXT NOT NULL,
  "codigoPuntoEmision" TEXT NOT NULL,
  "codigoTipoDocumento" TEXT NOT NULL,
  "rangoDesde" INTEGER NOT NULL,
  "rangoHasta" INTEGER NOT NULL,
  "fechaLimite" DATE NOT NULL,
  "modo" TEXT NOT NULL DEFAULT 'TALONARIO',
  "estado" TEXT NOT NULL DEFAULT 'activo',
  "ultimoCorrelativo" INTEGER NOT NULL DEFAULT 0,
  "alertaPorcentaje" INTEGER NOT NULL DEFAULT 80,
  "alertaDiasPrevios" INTEGER NOT NULL DEFAULT 30,
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalCai_pkey" PRIMARY KEY ("id"),
  -- Un rango al revés dejaría el CAI sin números que entregar.
  CONSTRAINT "FiscalCai_rango_check" CHECK ("rangoDesde" >= 1 AND "rangoHasta" >= "rangoDesde"),
  -- El contador solo puede ir hacia adelante y nunca pasarse del rango.
  CONSTRAINT "FiscalCai_contador_check" CHECK ("ultimoCorrelativo" >= 0 AND "ultimoCorrelativo" <= "rangoHasta")
);

CREATE UNIQUE INDEX "FiscalCai_codigo_key" ON "FiscalCai"("codigo");

CREATE INDEX "FiscalCai_tipoDocumento_estado_idx" ON "FiscalCai"("tipoDocumento", "estado");

-- Un solo CAI activo por tipo de documento: si hubiera dos, la emisión tendría que
-- elegir y elegiría mal. Es un índice parcial, que Prisma no sabe expresar.
CREATE UNIQUE INDEX "FiscalCai_activo_por_tipo_key"
  ON "FiscalCai"("tipoDocumento")
  WHERE "estado" = 'activo';

CREATE TABLE "FiscalDocument" (
  "id" TEXT NOT NULL,
  "caiId" TEXT NOT NULL,
  "tipoDocumento" TEXT NOT NULL,
  "correlativo" INTEGER NOT NULL,
  "numeroCompleto" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'emitido',
  "businessDate" DATE NOT NULL,
  "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emitidoPor" TEXT NOT NULL,
  "purchaseTransactionId" TEXT,
  "saleTransactionId" TEXT,
  "grindingServiceId" TEXT,
  "total" DECIMAL(12,2) NOT NULL,
  "moneda" TEXT NOT NULL DEFAULT 'HNL',
  "tipoCambio" DECIMAL(12,6),
  "importeExento" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "importeExonerado" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "importeGravado15" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "importeGravado18" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isv15" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isv18" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "formatoVersion" TEXT NOT NULL,
  "anuladoEn" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "anulacionMotivo" TEXT,
  "copiaFisicaResguardada" BOOLEAN NOT NULL DEFAULT false,
  "copiaFisicaUbicacion" TEXT,
  CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id"),
  -- Un documento ampara exactamente una transacción: ni ninguna ni dos.
  CONSTRAINT "FiscalDocument_una_transaccion_check" CHECK (
    (CASE WHEN "purchaseTransactionId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "saleTransactionId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "grindingServiceId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  -- Anular exige dejar constancia de por qué y cuándo.
  CONSTRAINT "FiscalDocument_anulacion_check" CHECK (
    "estado" <> 'anulado'
    OR ("anuladoEn" IS NOT NULL AND "anuladoPor" IS NOT NULL AND "anulacionMotivo" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "FiscalDocument_numeroCompleto_key" ON "FiscalDocument"("numeroCompleto");

-- Red de seguridad del correlativo: aunque el bloqueo de fila fallara, la base no
-- deja dos documentos con el mismo número en el mismo CAI.
CREATE UNIQUE INDEX "FiscalDocument_caiId_correlativo_key" ON "FiscalDocument"("caiId", "correlativo");

CREATE UNIQUE INDEX "FiscalDocument_purchaseTransactionId_key" ON "FiscalDocument"("purchaseTransactionId");

CREATE UNIQUE INDEX "FiscalDocument_saleTransactionId_key" ON "FiscalDocument"("saleTransactionId");

CREATE UNIQUE INDEX "FiscalDocument_grindingServiceId_key" ON "FiscalDocument"("grindingServiceId");

CREATE INDEX "FiscalDocument_businessDate_idx" ON "FiscalDocument"("businessDate");

CREATE INDEX "FiscalDocument_estado_idx" ON "FiscalDocument"("estado");

CREATE INDEX "FiscalDocument_emitidoEn_idx" ON "FiscalDocument"("emitidoEn");

ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_caiId_fkey"
  FOREIGN KEY ("caiId") REFERENCES "FiscalCai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT y no CASCADE: esto es lo que impide borrar una transacción que ya tiene
-- documento fiscal, incluso si una ruta futura olvida comprobarlo.
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_purchaseTransactionId_fkey"
  FOREIGN KEY ("purchaseTransactionId") REFERENCES "PurchaseTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_saleTransactionId_fkey"
  FOREIGN KEY ("saleTransactionId") REFERENCES "SaleTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_grindingServiceId_fkey"
  FOREIGN KEY ("grindingServiceId") REFERENCES "GrindingService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FiscalAuditLog" (
  "id" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "fiscalDocumentId" TEXT,
  "caiId" TEXT,
  "usuario" TEXT NOT NULL,
  "detalle" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalAuditLog_fiscalDocumentId_idx" ON "FiscalAuditLog"("fiscalDocumentId");

CREATE INDEX "FiscalAuditLog_caiId_idx" ON "FiscalAuditLog"("caiId");

CREATE INDEX "FiscalAuditLog_createdAt_idx" ON "FiscalAuditLog"("createdAt");

-- La bitácora no lleva llaves foráneas a propósito: tiene que sobrevivir a que el
-- documento o el CAI que menciona desaparezcan, y nada la borra en cascada.
