-- Número de registro de la SAG del adquiriente exonerado.
--
-- Completa el bloque del adquiriente exonerado junto a la constancia de registro
-- (del cliente) y la orden de compra exenta (del documento). Es del cliente por la
-- misma razón que la constancia: se registra una vez y vale para todas sus
-- operaciones.
--
-- Aditiva: la columna es opcional, así que nada de lo ya emitido cambia.

ALTER TABLE "Client" ADD COLUMN "registroSag" TEXT;
