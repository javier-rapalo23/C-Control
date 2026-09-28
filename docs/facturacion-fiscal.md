# Facturación y parte fiscal

Cómo funciona hoy la emisión de comprobantes en C-Control: qué imprime, cómo se numera, qué lleva
el bloque fiscal y **qué todavía no hace**. Última revisión: 27 de septiembre de 2026.

> **Estado (27/09/2026):** ya está aplicada la **Fase 1** del plan de `facturacion-sar-plan.md`: el
> modelo fiscal (`FiscalCai`, `FiscalDocument`, `FiscalAuditLog`) y el panel de CAI en
> Mantenimiento → Facturación. **La emisión todavía no existe**, así que todo lo que sigue describe
> el comportamiento vigente; ver §10.3 de `DOCUMENTACION.md` para lo nuevo.

> **Lo primero, para que no haya malentendidos:** hoy el sistema imprime **comprobantes internos**,
> no facturas fiscales. Tiene preparado el bloque de factura autorizada (CAI) y se activa llenando
> cuatro campos, pero el **correlativo fiscal** —el número que debe salir del rango autorizado por
> el SAR— no lo genera: ese número sigue saliendo del talonario físico y se captura a mano.

---

## 1. Los dos documentos que imprime el sistema

No compiten: el ticket es el comprobante rápido del mostrador y la factura A4 es el documento
formal que se le entrega al productor o al cliente.

| | Ticket térmico | Factura A4 |
| --- | --- | --- |
| Ancho | 32 columnas (ESC/POS) | Hoja A4 con márgenes de 14 mm |
| Cómo llega a la impresora | Se encola un `PrintJob`, un agente local lo recoge y lo manda por TCP al puerto 9100 | Diálogo de impresión del navegador |
| Qué necesita | IP de la impresora configurada + agente corriendo | Nada; usa la impresora que ya tiene la máquina |
| Contenido | El resultado: libras, precio, total, pesaje resumido | Trazabilidad completa del pesaje, ajustes y firmas |
| Copias | Dos tiras, cada una con su corte | Dos hojas |
| Bloque fiscal (CAI) | No lo imprime | Sí, cuando hay CAI configurado |
| Dónde se dispara | Botón **Ticket** en Compras y Ventas | Botón **Factura A4** (abre pestaña nueva) |

**Rutas de la factura A4:** `/print/compra/:id` y `/print/venta/:id`. Son páginas, no API. Se abren
fuera del panel, así que piden permiso de módulo por su cuenta (`purchases` y `sales`): quien no
puede ver Compras tampoco puede abrir la factura de una compra.

**Ruta del ticket:** `POST /api/print/ticket` con `{ transactionId, kind: 'purchase' | 'sale' }`.
Devuelve un `jobId`; el panel consulta `GET /api/print/jobs/:id` hasta que queda en `done` o `error`.

---

## 2. Numeración: son dos números distintos

Esta es la parte que más se confunde. Cada comprobante puede llevar **dos números** y significan
cosas diferentes.

| | Correlativo interno | Factura No. (talonario) |
| --- | --- | --- |
| Cómo se ve | `C-000123` (compras), `V-000123` (ventas) | Lo que diga el papel, por ejemplo `00123` |
| De dónde sale | Lo asigna la base de datos con una secuencia | Se escribe a mano al registrar la compra |
| Dónde se guarda | `PurchaseTransaction.numeroInterno`, `SaleTransaction.numeroInterno` | `PurchaseTransaction.numeroFactura` |
| ¿Puede faltar? | **Nunca.** Toda transacción lo tiene desde que se guarda | Sí, es opcional |
| ¿Aplica a ventas? | Sí, con serie propia (`V-`) | No. Solo compras |
| ¿Es válido ante el SAR? | **No.** Es de control interno | Es el del talonario autorizado |

### Por qué el interno lo pone la base y no el programa

Lo genera una **secuencia de Postgres**, no la aplicación. Si el número se calculara con un
`MAX(numeroInterno) + 1`, dos compras guardadas al mismo tiempo podrían recibir el mismo número.
Con la secuencia eso no puede pasar, y no hizo falta una tabla de correlativos ni bloqueos.

Consecuencias que conviene tener claras:

- **Serie aparte por tipo.** Compras y ventas corren por su cuenta, así que existen `C-000123` y
  `V-000123` a la vez. Se hizo así para que un número suelto no se pueda leer como el del otro
  documento.
- **El relleno a seis dígitos es cosmético.** El número real es el entero: `123` se imprime
  `C-000123`, y al pasar de 999 999 simplemente crece.
- **Borrar una transacción deja un hueco.** Las secuencias no reutilizan números: si se elimina la
  compra `C-000123`, ese número ya no vuelve a salir. No hay anulación de comprobantes (ver §7).
- **El del talonario no se puede corregir después.** Se captura al guardar la compra y ninguna ruta
  lo modifica; para cambiarlo hay que borrar la transacción y volverla a registrar.
- **Las transacciones viejas ya están numeradas.** La migración `20260925000000_add_numero_interno`
  las numeró en su orden de creación.

### Dónde se captura el del talonario

En Compras, campo **Factura No.** en la cabecera (máximo 40 caracteres, opcional). Va en la
cabecera y no en cada línea a propósito: una factura ampara toda la compra a un productor, y por
línea dos renglones de la misma compra podrían declarar facturas distintas.

Es opcional porque no siempre se factura en el momento del pesaje, y el productor no puede quedarse
esperando el papel para cobrar.

---

## 3. Dos copias: cliente y control interno

Los dos documentos imprimen **dos copias en un solo trabajo de impresión**.

**Factura A4** → dos hojas, cada una a tamaño completo con su espacio de firmas:

| Hoja | Rótulo |
| --- | --- |
| 1 | `ORIGINAL — CLIENTE` |
| 2 | `COPIA — CONTROL INTERNO` (en recuadro negro, para distinguirla de lejos) |

**Ticket térmico** → dos tiras, rotuladas `*** CLIENTE ***` y `*** CONTROL INTERNO ***` bajo el
título, con el correlativo interno debajo (`No. C-000123`).

Detalles de por qué está hecho así:

- **El rótulo va arriba.** Es lo que se busca al tener las dos copias en la mano, y en 32 columnas
  no se puede poner al margen.
- **Un solo trabajo de impresión, no dos.** En el ticket, cada copia termina con su propio corte de
  papel (`GS V`). Si fueran dos trabajos podrían quedar separados en la cola, o fallar uno, y la
  copia del control interno no saldría nunca.
- **Las dos copias llevan el mismo número interno**: es lo que permite casarlas.
- **El resumen del día no se duplica.** Es un reporte interno, no un comprobante que se entregue.

---

## 4. El bloque fiscal (CAI)

La factura A4 imprime un recuadro con los datos de la factura autorizada **solo si el CAI tiene
valor**. Mientras esté vacío, la factura sale como comprobante interno, que es lo que corresponde
mientras el negocio facture con talonario.

Los cuatro campos viven en `CompanySettings` (registro único) y se llenan en
**Mantenimiento → Empresa → Factura autorizada (SAR)**:

| Campo | Qué es | Ejemplo |
| --- | --- | --- |
| `cai` | Código de Autorización de Impresión. **Es el interruptor**: con valor, aparece el bloque | `ABCD-1234-EFGH` |
| `facturaRangoDesde` | Primer número del rango autorizado | `000-001-01-00000001` |
| `facturaRangoHasta` | Último número del rango autorizado | `000-001-01-00005000` |
| `facturaFechaLimite` | Fecha límite de emisión | `31/12/2027` |

Los cuatro son **texto libre** (máximo 40–50 caracteres). El sistema no valida el formato, no
verifica que el rango sea coherente ni avisa cuando la fecha límite está por vencerse.

Activar la facturación autorizada es llenar esos campos: no hay que tocar código ni desplegar nada.
Lo que **no** se resuelve llenándolos es el correlativo fiscal (§7).

---

## 5. Qué sale impreso en la factura A4

| Bloque | Contenido | Notas |
| --- | --- | --- |
| Encabezado | Nombre de la empresa, RTN, dirección, teléfono, correo | De `CompanySettings`. Si falta el nombre, imprime "Empresa sin nombre" |
| Identificación | Rótulo de la copia, título, `No.` interno, `Factura No.`, fecha, sucursal | El interno va primero y siempre |
| Bloque fiscal | CAI, rango autorizado, fecha límite | Solo con CAI configurado |
| Cliente | Nombre, finca, clave IHCAFE, RTN, teléfono, dirección | Cada dato sale solo si existe. Se rotula **Productor** en compras y **Cliente** en ventas |
| Líneas | Tipo de café, bruto, sacos, tara, neto, rendimiento, quintales oro, precio, valor | Lo que no se pesó sale con guion, no con cero |
| Ajustes al pie | Subtotal café, bono (+) y descuento (−) con su motivo | **Solo en compras**, y solo si hubo alguno |
| Total | `Total a pagar` en compras, `Total` en ventas | Es el ajustado: subtotal + bono − descuento |
| Forma de pago | Efectivo, depósito, cheque, pendiente | **Solo en compras** |
| Firmas | "Entregué conforme" / "Recibí conforme" | En las dos copias |

Dos criterios de impresión que vale la pena conocer:

- **El rendimiento vacío se imprime con guion, no con cero.** Un `0 %` impreso se lee como "no
  rindió", y lo cierto es que todavía no se sabe.
- **En ventas, el precio por quintal oro se rotula distinto** (`L 3,200.00 / qq oro` frente a
  `L 22.00 / lb`), para que nadie lea un precio por quintal como si fuera por libra.

---

## 6. Qué se factura

**Todo lo que se compra y se vende.** Durante un tiempo solo uva y pergamino "se facturaban" y verde,
requema, guacuco y repaso quedaban fuera; el negocio lo aclaró el 27/09/2026 y esa distinción se
eliminó del sistema —del código, del `ProductoDTO` y de las parrillas de Compras, Ventas e
Inventario, donde salía como "Se factura / No se factura"—.

La categoría del producto (`uva`, `pergamino`, `otros`) se quedó para lo que sí decide: agrupar el
reporte de temporada y habilitar el modo oro.

El **servicio de molido** también se factura, y es el único ingreso que no está exonerado del ISV: el
monto que se captura ya lo incluye, así que el desglose se calcula hacia atrás (base = monto ÷ 1.15).

---

## 7. Lo que el sistema NO hace

Importante para no dar por cubierto lo que no lo está:

| No hace | Qué implica |
| --- | --- |
| **Generar el correlativo fiscal del rango del CAI** | El número autorizado sale del talonario y se captura a mano. El correlativo interno (`C-000123`) **no lo sustituye** |
| **Calcular impuestos (ISV) ni exoneraciones** | No hay ninguna noción de impuesto en el sistema: el total es el monto del café más o menos los ajustes |
| **Anular comprobantes** | No existe el estado "anulada". Se borra la transacción, lo que deja un hueco en la numeración y ningún rastro del documento |
| **Notas de crédito o débito** | No existen |
| **Llevar libro de ventas ni reporte fiscal** | Los reportes son de negocio (compras, ventas, gastos por rango), no declaraciones |
| **Validar el CAI, el rango o el vencimiento** | Son texto libre; nadie avisa si el rango se agotó o la fecha límite pasó |
| **Guardar copia electrónica del documento emitido** | La factura se arma cada vez desde los datos actuales de la transacción y de la empresa. Si mañana cambia el nombre de la empresa, una factura vieja se reimprime con el nombre nuevo |
| **Numerar las ventas en el talonario** | `numeroFactura` es solo de compras |
| **Hoja de facturación por productor** | Pendiente: el detalle línea por línea de un productor en el formato con el que se le liquida |

---

## 8. Cómo activar la facturación autorizada

1. Llenar CAI, rango desde, rango hasta y fecha límite en **Mantenimiento → Empresa**.
2. Imprimir una factura de prueba y verificar que el recuadro fiscal aparezca con los cuatro datos.
3. Seguir capturando a mano el número del talonario en **Factura No.** de cada compra.

Si lo que se quiere es que **el sistema** emita el número autorizado, hay que programarlo. Como
mínimo: un correlativo por rango que no se salte ni repita números, control de qué pasa al agotarse
el rango o vencer la fecha, y anulación de documentos (porque un número fiscal emitido no se puede
borrar, solo anular). Nada de eso existe hoy.

---

## 9. Dónde está cada cosa en el código

| Archivo | Qué hace |
| --- | --- |
| `lib/build-invoice.ts` | Reúne los datos de la factura A4 (compras y ventas) y formatea el correlativo interno (`formatNumeroInterno`) |
| `components/invoice-a4.tsx` | La hoja: maquetación, CSS de impresión y las dos copias |
| `components/invoice-toolbar.tsx` | Botón de imprimir; el CSS lo oculta al imprimir |
| `app/print/compra/[id]/page.tsx`, `app/print/venta/[id]/page.tsx` | Las páginas de factura, con su control de acceso |
| `lib/thermal-printer.ts` | Buffers ESC/POS: ticket (dos copias) y resumen del día |
| `lib/build-ticket.ts` | Reúne los datos del ticket y del resumen |
| `app/api/print/ticket/route.ts` | Encola el `PrintJob` del ticket |
| `app/api/print/agent/*` | Endpoints del agente local: reclama trabajos pendientes y reporta el resultado. Se autentica con `PRINT_AGENT_TOKEN` |
| `app/api/settings/company/route.ts` | Lee y guarda los datos de empresa, incluidos los fiscales |
| `components/maintenance-company-panel.tsx` | Formulario de Mantenimiento → Empresa |
| `prisma/schema.prisma` | `CompanySettings` (datos fiscales), `numeroInterno` y `numeroFactura` en las cabeceras, `PrintJob` |

**Migraciones relacionadas:**

| Migración | Qué trajo |
| --- | --- |
| `20260915000000_invoice_number_and_fiscal_base` | `PurchaseTransaction.numeroFactura` y los cuatro campos fiscales de `CompanySettings` |
| `20260925000000_add_numero_interno` | `numeroInterno` en compras y ventas: secuencia, único y backfill en orden de creación |

**Pruebas:** `tests/lib/build-invoice.test.ts` (datos de la factura, correlativo, bloque fiscal solo
con CAI), `tests/components/invoice-a4.test.tsx` (HTML de la hoja, las dos copias, cuadre de
columnas) y `tests/lib/ticket-copias.test.ts` (dos copias en el buffer, un corte por copia).

---

## 10. Estado y pendientes

- La migración `20260925000000_add_numero_interno` **debe aplicarse** (`npx prisma migrate dev`, o
  `prisma migrate deploy` en producción) antes de usar la app: la columna es `NOT NULL` y sin ella
  fallan las consultas de compras y ventas.
- Falta ver impreso el corte entre las dos copias, tanto en A4 como en la térmica.
- Para el detalle de decisiones de diseño, ver `DOCUMENTACION.md` §10.1 (ticket), §10.2 (factura
  A4 y numeración) y §19.3 (por qué el número del talonario se captura a mano).
