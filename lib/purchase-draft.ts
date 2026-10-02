import { Prisma, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { assertCashOpen } from '@/lib/cash-session';
import { parseBusinessDate } from '@/lib/business-date';
import { resolveSucursalId } from '@/lib/ledger';
import { computeQuintalesOro } from '@/lib/oro';
import type { createPurchaseTransactionSchema } from '@/lib/validations';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CompraPayload = z.infer<typeof createPurchaseTransactionSchema>;

/**
 * Cálculo de una compra antes de guardarla: líneas, ajustes al pie y total.
 *
 * Lo comparten el guardado (`POST /api/purchase-transactions`) y la vista previa de la
 * boleta. Tienen que salir de la misma función: si la vista previa calculara por su
 * cuenta, lo que el productor revisa en pantalla podría no ser lo que se guarda y se
 * imprime.
 *
 * Solo lee. Lanza los mismos errores que el guardado —cliente o producto que no
 * existen, caja cerrada, total negativo— para que la vista previa avise antes de que
 * alguien confirme algo que no se va a poder guardar.
 */
export async function calcularCompra(db: DbClient, payload: CompraPayload) {
  const client = await db.client.findUnique({ where: { id: payload.clientId } });
  if (!client) {
    throw new Error('Client not found');
  }

  const sucursalId = await resolveSucursalId(db, payload.sucursalId);
  await assertCashOpen(db, payload.businessDate, sucursalId);

  const lineas = await Promise.all(
    payload.items.map(async (item) => {
      const producto = await db.producto.findUnique({ where: { id: item.productoId } });
      if (!producto) {
        throw new Error(`Producto not found: ${item.productoId}`);
      }

      const precioPorLibra = new Prisma.Decimal(item.precioPorLibra);

      let pesoBruto: Prisma.Decimal | null = null;
      let numeroSacos: number | null = null;
      let taraPorSaco: Prisma.Decimal | null = null;
      let libras: Prisma.Decimal;

      if (item.pesoBruto !== undefined) {
        pesoBruto = new Prisma.Decimal(item.pesoBruto);
        numeroSacos = item.numeroSacos ?? 0;
        taraPorSaco = new Prisma.Decimal(item.taraPorSaco ?? Number(producto.taraPorSaco ?? 0));
        const taraTotal = taraPorSaco.mul(numeroSacos);
        libras = pesoBruto.sub(taraTotal);
      } else {
        libras = new Prisma.Decimal(item.libras ?? 0);
      }

      // El oro es solo una cifra de referencia para la facturación de fin de
      // temporada: sin rendimiento capturado la línea no lo reporta, y el pago
      // al productor —libras × precio— sale igual.
      const porcentajeOro = item.porcentajeOro !== undefined ? new Prisma.Decimal(item.porcentajeOro) : null;
      const quintalesOro = porcentajeOro !== null ? computeQuintalesOro(libras, porcentajeOro) : null;

      const total = precioPorLibra.mul(libras);

      return {
        // Va aparte de la fila porque no se guarda en ella: solo lo necesita el
        // desglose del ISV de la vista previa.
        clasificacionFiscal: producto.clasificacionFiscal,
        fila: {
          businessDate: parseBusinessDate(payload.businessDate),
          sucursalId,
          productoId: producto.id,
          productoNombre: producto.nombre,
          precioPorLibra,
          pesoBruto,
          numeroSacos,
          taraPorSaco,
          porcentajeOro,
          quintalesOro,
          libras,
          total,
        },
      };
    }),
  );

  const items = lineas.map((linea) => linea.fila);

  // El café por su cuenta: es lo que reportan compras por producto y por cliente.
  const subtotal = items.reduce((accumulator, item) => accumulator.add(item.total), new Prisma.Decimal(0));
  const bono = new Prisma.Decimal(payload.bono ?? 0);
  const descuento = new Prisma.Decimal(payload.descuento ?? 0);
  // Lo que se le paga al productor, y por tanto lo que sale de la caja.
  const total = subtotal.add(bono).sub(descuento);

  if (total.isNegative()) {
    throw new Error('NEGATIVE_TOTAL');
  }

  return {
    client,
    sucursalId,
    items,
    clasificaciones: lineas.map((linea) => linea.clasificacionFiscal),
    subtotal,
    bono,
    descuento,
    total,
  };
}
