-- Formato de impresión por omisión de la factura.
--
-- El ticket de 80 mm y la hoja A4 son el mismo documento fiscal impreso de dos
-- maneras, así que esto es una preferencia y no un dato del documento. El default
-- deja todo como venía: A4.
ALTER TABLE "CompanySettings" ADD COLUMN "formatoImpresionDefault" TEXT NOT NULL DEFAULT 'a4';
