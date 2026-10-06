import { Prisma, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { assertCashOpen } from '@/lib/cash-session';
import { parseBusinessDate } from '@/lib/business-date';
import { resolveSucursalId } from '@/lib/ledger';
import { computeQuintalesOro } from '@/lib/oro';
import type { createSaleTransactionSchema } from '@/lib/validations';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type VentaPayload = z.infer<typeof createSaleTransactionSchema>;

/**
 * Cálculo de una venta antes de guardarla: líneas y total.
 *
 * Lo comparten el guardado (`POST /api/sale-transactions`) y la vista previa de la
 * factura, por lo mismo que `calcularCompra`: lo que el cliente revisa en pantalla
 * tiene que ser lo que se guarda y se imprime.
 *
 * Solo lee. Lanza los mismos errores que el guardado —cliente o producto que no
 * existen, caja cerrada, tara mayor que el bruto— para que la vista previa avise antes
 * de que alguien confirme algo que no se va a poder guardar.
 */
export async function calcularVenta(db: DbClient, payload: VentaPayload) {
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

      // Mismo pesaje que compras: con peso bruto, las libras son el neto.
      let pesoBruto: Prisma.Decimal | null = null;
      let numeroSacos: number | null = null;
      let taraPorSaco: Prisma.Decimal | null = null;
      let libras: Prisma.Decimal;

      if (item.pesoBruto !== undefined) {
        pesoBruto = new Prisma.Decimal(item.pesoBruto);
        numeroSacos = item.numeroSacos ?? 0;
        taraPorSaco = new Prisma.Decimal(item.taraPorSaco ?? Number(producto.taraPorSaco ?? 0));
        libras = pesoBruto.sub(taraPorSaco.mul(numeroSacos));
        if (libras.lte(0)) {
          throw new Error('INVALID_NET_WEIGHT');
        }
      } else {
        libras = new Prisma.Decimal(item.libras ?? 0);
      }

      const base = {
        businessDate: parseBusinessDate(payload.businessDate),
        sucursalId,
        productoId: producto.id,
        productoNombre: producto.nombre,
        pesoBruto,
        numeroSacos,
        taraPorSaco,
        libras,
      };

      if (item.precioPorQuintalOro !== undefined) {
        // Modo Oro: la conversión es la misma que en compras (`lib/oro.ts`).
        const porcentajeOro = new Prisma.Decimal(item.porcentajeOro!);
        const precioPorQuintalOro = new Prisma.Decimal(item.precioPorQuintalOro);
        const quintalesOro = computeQuintalesOro(libras, porcentajeOro);

        return {
          clasificacionFiscal: producto.clasificacionFiscal,
          fila: {
            ...base,
            precioPorLibra: null,
            porcentajeOro,
            quintalesOro,
            precioPorQuintalOro,
            monto: quintalesOro.mul(precioPorQuintalOro),
          },
        };
      }

      // El esquema exige `precioPorLibra` fuera del modo oro: el catálogo ya no
      // guarda precio del que tirar.
      const precioPorLibra = new Prisma.Decimal(item.precioPorLibra!);

      // Por libra el rendimiento es opcional y no toca el monto: igual que en
      // compras, los quintales oro quedan solo como referencia.
      const porcentajeOro = item.porcentajeOro !== undefined ? new Prisma.Decimal(item.porcentajeOro) : null;
      const quintalesOro = porcentajeOro !== null ? computeQuintalesOro(libras, porcentajeOro) : null;

      return {
        clasificacionFiscal: producto.clasificacionFiscal,
        fila: {
          ...base,
          precioPorLibra,
          porcentajeOro,
          quintalesOro,
          precioPorQuintalOro: null,
          monto: precioPorLibra.mul(libras),
        },
      };
    }),
  );

  const items = lineas.map((linea) => linea.fila);
  const total = items.reduce((accumulator, item) => accumulator.add(item.monto), new Prisma.Decimal(0));

  return {
    client,
    sucursalId,
    items,
    clasificaciones: lineas.map((linea) => linea.clasificacionFiscal),
    total,
  };
}
