-- Notas de crédito y débito (Fase 5 de docs/facturacion-sar-plan.md).
--
-- Una nota no ampara una transacción: modifica **otro documento ya emitido**. Es la
-- única forma de corregir después del día de emisión, porque anular está limitado al
-- mismo día.
--
-- Aditiva en columnas, pero **reemplaza un CHECK**: el viejo exigía exactamente una
-- transacción referenciada, y una nota no referencia ninguna.

ALTER TABLE "FiscalDocument" ADD COLUMN "documentoOrigenId" TEXT;
ALTER TABLE "FiscalDocument" ADD COLUMN "notaMotivo" TEXT;

CREATE INDEX "FiscalDocument_documentoOrigenId_idx" ON "FiscalDocument"("documentoOrigenId");

-- Autorreferencia con RESTRICT: un documento con notas emitidas no se puede borrar sin
-- borrar antes las notas, igual que una transacción documentada.
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_documentoOrigenId_fkey"
  FOREIGN KEY ("documentoOrigenId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El viejo exigía exactamente una transacción. Sigue valiendo para facturas y boletas,
-- pero una nota tiene las tres columnas vacías.
ALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_una_transaccion_check";

-- O ampara una transacción (y entonces no modifica ningún documento), o modifica un
-- documento (y entonces no ampara transacción). Nunca las dos cosas, nunca ninguna.
--
-- Se comprueba la **forma** y no el tipo de documento: así el catálogo de tipos sigue
-- viviendo en `lib/fiscal.ts` y agregar uno nuevo no obliga a migrar la base.
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_referencia_check" CHECK (
  (
    (CASE WHEN "purchaseTransactionId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "saleTransactionId" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "grindingServiceId" IS NULL THEN 0 ELSE 1 END) = 1
    AND "documentoOrigenId" IS NULL
  )
  OR (
    "purchaseTransactionId" IS NULL
    AND "saleTransactionId" IS NULL
    AND "grindingServiceId" IS NULL
    AND "documentoOrigenId" IS NOT NULL
  )
);

-- Una nota sin motivo no sirve de nada ante una revisión, y una nota sobre sí misma es
-- un ciclo que rompería cualquier recorrido.
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_nota_check" CHECK (
  "documentoOrigenId" IS NULL
  OR ("notaMotivo" IS NOT NULL AND "documentoOrigenId" <> "id")
);
