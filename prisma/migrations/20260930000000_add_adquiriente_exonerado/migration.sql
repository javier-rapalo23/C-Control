-- Datos del adquiriente exonerado, pedidos por la contadora el 29/09/2026.
--
-- Son dos datos con dueños distintos, y de ahí que vayan en tablas distintas:
--
--   * La **constancia de registro de exonerado** la emite el SAR a nombre del cliente y
--     vale para todas sus operaciones: es del cliente.
--   * La **orden de compra exenta** ampara una operación concreta y cambia en cada una:
--     es del documento.
--
-- Aditiva: las dos columnas son opcionales, así que nada de lo ya emitido cambia.

ALTER TABLE "Client" ADD COLUMN "registroExonerado" TEXT;

ALTER TABLE "FiscalDocument" ADD COLUMN "ordenCompraExenta" TEXT;
