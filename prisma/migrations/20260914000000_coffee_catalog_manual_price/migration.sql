-- El precio sale del catálogo de productos: el café se paga a un precio distinto
-- por cliente y por día, así que se captura a mano en cada línea de compra o venta.
ALTER TABLE "Producto" DROP COLUMN "precioPorLibra";

-- El rendimiento a oro tampoco es del producto: varía por lote y por productor.
-- Pasa a capturarse por línea en compras (abajo), como ya ocurría en ventas.
ALTER TABLE "Producto" DROP COLUMN "factorConversionOro";

-- Rendimiento en porcentaje (54.0000), con el mismo tipo que "Sale"."porcentajeOro".
--
-- Las compras ya guardadas quedan en NULL: su "quintalesOro" se calculó con el
-- factor fijo del producto y nadie registró el rendimiento real del lote, así que
-- no hay de dónde derivarlo. Se dejan como están —solo son una cifra de
-- referencia, el pago nunca pasó por el oro— y las nuevas ya nacen con su
-- porcentaje explícito.
ALTER TABLE "Purchase" ADD COLUMN "porcentajeOro" DECIMAL(6,4);
