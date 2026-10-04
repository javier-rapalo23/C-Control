import { createPurchaseTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { buildInvoiceForPurchaseDraft } from '@/lib/build-invoice';
import { vistaPreviaDocumentoFiscal } from '@/lib/fiscal-document';
import { calcularCompra } from '@/lib/purchase-draft';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/payment-methods';
import { ModulePermissionError, requireApiModuleAccess } from '@/lib/require-api-module-access';

/**
 * Vista previa de la boleta de una compra **antes de guardarla**.
 *
 * Recibe lo mismo que `POST /api/purchase-transactions` y no escribe nada: calcula la
 * compra con la misma función que el guardado y la arma con la misma función que el
 * documento emitido. Es lo que el productor revisa antes de que se consuma un número
 * del CAI.
 *
 * Dice además si al confirmar se va a emitir la boleta y, si no, por qué: sin CAI
 * activo, en modo talonario o sin el permiso `fiscal_emitir`, la compra se puede
 * guardar igual, pero sale sin documento y queda en "Pendientes de emitir".
 */
export async function POST(request: Request) {
  try {
    const payload = createPurchaseTransactionSchema.parse(await request.json());
    const compra = await calcularCompra(prisma, payload);

    const [sucursal, fiscal, permiso] = await Promise.all([
      prisma.sucursal.findUnique({ where: { id: compra.sucursalId }, select: { nombre: true } }),
      vistaPreviaDocumentoFiscal(
        prisma,
        'compra',
        compra.items.map((item, indice) => ({
          monto: Number(item.total),
          clasificacionFiscal: compra.clasificaciones[indice],
        })),
        Number(compra.total),
      ),
      // Se comprueba aquí y no al confirmar: avisar después de guardar que la boleta
      // no se pudo emitir es justo lo que la vista previa tiene que evitar.
      requireApiModuleAccess(request, 'fiscal_emitir').then(
        () => true,
        (error: unknown) => {
          if (error instanceof ModulePermissionError) return false;
          throw error;
        },
      ),
    ]);

    const invoice = await buildInvoiceForPurchaseDraft({
      numeroFactura: payload.numeroFactura ?? null,
      businessDate: payload.businessDate,
      sucursalNombre: sucursal?.nombre ?? '',
      metodoPago: payload.metodoPago ?? DEFAULT_PAYMENT_METHOD,
      client: compra.client,
      items: compra.items,
      bono: compra.bono,
      bonoMotivo: payload.bonoMotivo ?? null,
      descuento: compra.descuento,
      descuentoMotivo: payload.descuentoMotivo ?? null,
      total: compra.total,
    });

    const motivoNoEmite =
      fiscal.motivoNoEmite ??
      (permiso ? null : 'Su usuario no tiene permiso para emitir documentos fiscales (fiscal_emitir).');
    invoice.documento = motivoNoEmite ? null : fiscal.documento;

    return success({
      invoice,
      emitira: invoice.documento !== null,
      motivoNoEmite,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return failure('NOT_FOUND', 'Cliente no encontrado', 404);
    }

    if (error instanceof Error && error.message === 'NEGATIVE_TOTAL') {
      return failure('VALIDATION_ERROR', 'El descuento no puede ser mayor que el café más el bono', 400);
    }

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}
