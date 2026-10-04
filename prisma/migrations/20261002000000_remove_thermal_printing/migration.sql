-- Se deja de usar la impresora térmica de 80 mm (02/10/2026).
--
-- La factura se imprime en hoja A4 o en papel continuo, las dos desde el navegador,
-- así que ya no hacen falta la cola de trabajos del agente de impresión ni la IP y el
-- puerto de la térmica.
--
-- Quien tenía el ticket como formato por omisión pasa a A4: `termico80` ya no es un
-- formato válido y la aplicación lo leería como desconocido.
UPDATE "CompanySettings" SET "formatoImpresionDefault" = 'a4' WHERE "formatoImpresionDefault" = 'termico80';

ALTER TABLE "CompanySettings" DROP COLUMN "printerIp", DROP COLUMN "printerPort";

-- La cola solo guardaba trabajos de impresión ya enviados o pendientes de enviar: no
-- hay nada en ella que haga falta conservar.
DROP TABLE "PrintJob";
