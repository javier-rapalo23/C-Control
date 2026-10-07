import { previewSaleTransactionSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { buildInvoiceForSaleDraft } from '@/lib/build-invoice';
import { vistaPreviaDocumentoFiscal } from '@/lib/fiscal-document';
import { CREDITO_CLIENTE_GENERAL, calcularVenta } from '@/lib/sale-draft';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/payment-methods';
import { ModulePermissionError, requireApiModuleAccess } from '@/lib/require-api-module-access';

/**
 * Vista previa de la factura de una venta **antes de guardarla**. Es la contraparte de
 * `POST /api/purchase-transactions/preview`: calcula la venta con la misma función que
 * el guardado, la arma con la misma función que el documento emitido y no escribe nada.
 *
 * Recibe además el número del talonario y la orden de compra exenta, si se escribieron:
 * con el número, un CAI de talonario también se emite al confirmar, y la orden sale
 * impresa en el bloque del adquiriente exonerado.
 */
export async function POST(request: Request) {
  try {
    const { numeroManual, ordenCompraExenta, ...payload } = previewSaleTransactionSchema.parse(await request.json());
    const venta = await calcularVenta(prisma, payload);

    const [sucursal, fiscal, permiso] = await Promise.all([
      prisma.sucursal.findUnique({ where: { id: venta.sucursalId }, select: { nombre: true } }),
      vistaPreviaDocumentoFiscal(
        prisma,
        'venta',
        venta.items.map((item, indice) => ({
          monto: Number(item.monto),
          clasificacionFiscal: venta.clasificaciones[indice],
        })),
        Number(venta.total),
        { numeroManual, ordenCompraExenta },
      ),
      // Se comprueba aquí y no al confirmar: avisar después de guardar que la factura
      // no se pudo emitir es justo lo que la vista previa tiene que evitar.
      requireApiModuleAccess(request, 'fiscal_emitir').then(
        () => true,
        (error: unknown) => {
          if (error instanceof ModulePermissionError) return false;
          throw error;
        },
      ),
    ]);

    const invoice = await buildInvoiceForSaleDraft({
      businessDate: payload.businessDate,
      sucursalNombre: sucursal?.nombre ?? '',
      metodoPago: payload.metodoPago ?? DEFAULT_PAYMENT_METHOD,
      client: venta.client,
      items: venta.items,
      total: venta.total,
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

    if (error instanceof Error && error.message === 'CREDIT_GENERAL_CLIENT') {
      return failure('VALIDATION_ERROR', CREDITO_CLIENTE_GENERAL, 400);
    }

    if (error instanceof Error && error.message === 'INVALID_NET_WEIGHT') {
      return failure('VALIDATION_ERROR', 'La tara no puede ser mayor o igual al peso bruto', 400);
    }

    if (error instanceof Error && error.message.startsWith('Producto not found:')) {
      return failure('NOT_FOUND', error.message, 404);
    }

    return handleApiError(error);
  }
}
