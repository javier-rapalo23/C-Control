# Facturación y parte fiscal

Cómo funciona hoy la emisión de comprobantes en C-Control: qué imprime, cómo se numera, qué lleva
el bloque fiscal y **qué todavía no hace**. Última revisión: 28 de septiembre de 2026.

> **Estado (28/09/2026):** están aplicadas las **Fases 1 a 5** del plan de
> `facturacion-sar-plan.md`: el modelo fiscal (`FiscalCai`, `FiscalDocument`, `FiscalAuditLog`) con
> su panel en Mantenimiento → Facturación, la **emisión** del correlativo autorizado y la
> **anulación**, la impresión desde el snapshot en los dos formatos, los **reportes fiscales**
> (libro de compras, libro de ventas, pendientes de emitir, estado del CAI, con exportación a CSV) y
> las **notas de crédito y débito**. Quedan fuera de alcance, por decisión del 27/09, las retenciones
> IHCAFE y la guía de remisión.

> **Lo primero, para que no haya malentendidos:** una transacción **sin documento emitido** se
> imprime rotulada *"comprobante interno — no es documento fiscal"*, y no lleva CAI. Se vuelve
> documento fiscal cuando alguien lo **emite**, y ahí toma el número del rango autorizado. En modo
> `SISTEMA` ese número lo asigna la aplicación; en modo `TALONARIO` se teclea el del papel y el
> sistema lo valida contra el rango. Emitir exige el permiso `fiscal_emitir`; anular, `fiscal_anular`.

---

## 1. Un documento, dos formatos de impresión

El ticket de 80 mm y la hoja A4 **no son dos documentos**: son dos formatos del mismo, con el mismo
número fiscal y los mismos datos. El ticket es el del mostrador y la A4 la que se entrega; cuál se usa
por omisión se configura en Mantenimiento → Facturación, y en cada fila se puede imprimir el otro.

| | Ticket térmico | Factura A4 |
| --- | --- | --- |
| Ancho | 32 columnas (ESC/POS) | Hoja A4 con márgenes de 14 mm |
| Cómo llega a la impresora | Se encola un `PrintJob`, un agente local lo recoge y lo manda por TCP al puerto 9100 | Diálogo de impresión del navegador |
| Qué necesita | IP de la impresora configurada + agente corriendo | Nada; usa la impresora que ya tiene la máquina |
| Contenido | El resultado: libras, precio, total, pesaje resumido | Trazabilidad completa del pesaje, ajustes y firmas |
| Copias | Dos tiras, cada una con su corte | Dos hojas |
| Bloque fiscal (CAI) | Sí, cuando el documento está emitido | Sí, cuando el documento está emitido |
| Dónde se dispara | **Imprimir factura** en Compras, Ventas y Molido, según el formato configurado; el botón de al lado imprime en el otro | Igual (abre pestaña nueva) |

**Rutas de la factura A4:** `/print/compra/:id` y `/print/venta/:id`. Son páginas, no API. Se abren
fuera del panel, así que piden permiso de módulo por su cuenta (`purchases` y `sales`): quien no
puede ver Compras tampoco puede abrir la factura de una compra.

**Ruta del ticket:** `POST /api/print/ticket` con `{ transactionId, kind }`, donde `kind` es `compra`,
`venta` o `molido` (se aceptan los nombres viejos `purchase` y `sale`).
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

El recuadro con CAI, rango autorizado y fecha límite se imprime **solo si el documento está
emitido**, y sale del CAI con el que se emitió, guardado en el documento. Sin documento, la hoja y el
ticket llevan el rótulo *"comprobante interno — no es documento fiscal"* y ningún CAI.

El CAI se administra en **Mantenimiento → Facturación** (tabla `FiscalCai`), un registro por
autorización:

| Campo | Qué es | Ejemplo |
| --- | --- | --- |
| `codigo` | Código de Autorización de Impresión, único en la base | `ABCD-1234-EFGH` |
| `tipoDocumento` | Sobre qué se emite: boleta de compra, factura… | `boleta_compra` |
| `codigoEstablecimiento`, `codigoPuntoEmision`, `codigoTipoDocumento` | Los tres primeros segmentos del número | `001`, `001`, `04` |
| `rangoDesde`, `rangoHasta` | Rango autorizado, solo el correlativo | `1`, `500` |
| `fechaLimite` | Fecha límite de emisión | `2027-12-31` |
| `modo` | `SISTEMA` (el número lo asigna la app) o `TALONARIO` (se teclea el del papel) | `SISTEMA` |
| `ultimoCorrelativo` | Contador. Es la fila que se bloquea al emitir | `123` |
| `alertaPorcentaje`, `alertaDiasPrevios` | Cuándo avisar que el rango se agota o la fecha se acerca | `80`, `30` |

**Solo puede haber un CAI activo por tipo de documento**, garantizado por un índice parcial. Agotado
y vencido **no se guardan**: se derivan del rango y de la fecha en cada lectura, para que no puedan
quedar desactualizados el día que pasa la fecha límite sin que nadie escriba nada.

Los cuatro campos viejos de `CompanySettings` (`cai`, `facturaRangoDesde`, `facturaRangoHasta`,
`facturaFechaLimite`) quedaron como **datos históricos y ya no se imprimen**. Con ellos llenos, una
hoja sin documento salía rotulada "no es documento fiscal" y con un CAI debajo: un código de
autorización sobre un papel sin correlativo autorizado.

---

## 5. Qué sale impreso en la factura A4

| Bloque | Contenido | Notas |
| --- | --- | --- |
| Encabezado | Nombre de la empresa, RTN, dirección, teléfono, correo | De `CompanySettings`. Si falta el nombre, imprime "Empresa sin nombre" |
| Identificación | Rótulo de la copia, título, `No.` interno, `Factura No.`, fecha, sucursal | El interno va primero y siempre |
| Bloque fiscal | CAI, rango autorizado, fecha límite | Solo con documento emitido; si no, el rótulo de comprobante interno |
| Desglose | Importe exento, exonerado, gravado 15 %, ISV 15 %, gravado 18 %, ISV 18 % y total | Solo con documento emitido, y **los siete renglones siempre, aunque vayan en cero** |
| Cliente | Nombre, finca, clave IHCAFE, RTN, teléfono, dirección | Cada dato sale solo si existe. Se rotula **Productor** en compras y **Cliente** en ventas |
| Adquiriente exonerado | Nombre o razón social, RTN, constancia de registro, orden de compra exenta | Solo si el cliente tiene constancia o la operación trae orden (§6) |
| Líneas (compra) | Tipo de café, bruto, tara, neto, quintales oro, precio, valor | **Sin sacos ni rendimiento**: la tara ya explica el descuento y el rendimiento es una estimación del beneficio |
| Líneas (venta) | Concepto, bruto, sacos, tara, neto, rendimiento, quintales oro, precio, valor | Detalle completo; lo revisa un comprador. Lo que no se pesó sale con guion, no con cero |
| Ajustes al pie | Subtotal café, bono (+) y descuento (−) con su motivo | **Solo en compras**, y solo si hubo alguno |
| Total | `Total a pagar` en compras, `Total` en ventas | Es el ajustado: subtotal + bono − descuento |
| Forma de pago | Efectivo, depósito, cheque, pendiente | **Solo en compras** |
| Firmas | "Entregué conforme" / "Recibí conforme" | En las dos copias |

Cuatro criterios de impresión que vale la pena conocer:

- **El rendimiento vacío se imprime con guion, no con cero.** Un `0 %` impreso se lee como "no
  rindió", y lo cierto es que todavía no se sabe.
- **En ventas, el precio por quintal oro se rotula distinto** (`L 3,200.00 / qq oro` frente a
  `L 22.00 / lb`), para que nadie lea un precio por quintal como si fuera por libra.
- **El desglose imprime los siete renglones en cero.** Es lo contrario del criterio anterior y a
  propósito: el formato del SAR los trae preimpresos, y una factura sin el renglón del ISV no se lee
  como completa. Un rendimiento en cero, en cambio, afirma algo falso.
- **En el ticket de 80 mm las líneas se envuelven.** La térmica no ajusta: lo que pasa de 32 columnas
  se pierde, y una razón social cortada a la mitad en un documento fiscal es un defecto. El nombre del
  cliente, el concepto de una nota y los datos del exonerado se reparten en varias líneas.

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

### Con qué documento

Cada parte de la operación tiene **su propio documento, su propio CAI y su propio rango**:

| Operación | Documento | Dónde se registra su CAI |
| --- | --- | --- |
| Compras a productores | Boleta de compra | Mantenimiento → Facturación, tipo "Boleta de compra" |
| Ventas y molido | Factura | Mantenimiento → Facturación, tipo "Factura" |
| Correcciones | Nota de crédito o de débito | Igual, un CAI por tipo de nota (§9) |

El panel arranca con un resumen de **qué autorización hace falta** y el estado de cada una: sin el CAI
de boleta de compra no se puede documentar una compra, aunque el de factura esté cargado.

### Adquiriente exonerado

Cuando el comprador está exonerado, el documento tiene que decir de quién es la exoneración y con qué
se amparó. Son dos datos con dueños distintos:

- La **constancia de registro de exonerado** la emite el SAR a nombre del cliente y vale para todas sus
  operaciones: se registra una vez en **Clientes**, columna "Constancia exonerado".
- La **orden de compra exenta** ampara una sola operación, así que se escribe **al emitir**. El campo
  aparece en la fila solo si el cliente tiene constancia.

El bloque impreso sale con cualquiera de los dos datos: una venta exonerada puede no llevar orden de
compra. La constancia queda en el snapshot, así que si después se le retira la exoneración al cliente,
el papel ya emitido sigue diciendo con qué se sustentó.

---

## 7. Emisión, anulación y reimpresión

**Emitir** (`fiscal_emitir`) toma el siguiente número del CAI activo del tipo que corresponde y crea
el documento. Dos garantías, que son la razón del diseño:

- **El número no se salta ni se repite.** El contador vive en la fila del CAI y se bloquea con
  `SELECT … FOR UPDATE` dentro de la misma transacción que crea el documento. Si algo falla, el
  rollback devuelve el contador y **el número no se consume**. Una secuencia de Postgres no servía:
  el rollback se la come y deja hueco.
- **Lo emitido es inmutable.** El documento guarda un `snapshot` de todo lo impreso, así que
  reimprimir no depende de los datos vivos: si mañana cambia el nombre de la empresa o el RTN del
  cliente, la reimpresión sigue mostrando lo que se entregó. La transacción amparada queda bloqueada
  para edición y borrado, en la aplicación y en la base (`onDelete: Restrict`).

La **fecha de emisión es hoy y no se edita**: de eso depende que el orden de los números coincida con
el de las fechas. La fecha de negocio de la transacción se guarda aparte, porque el papel a veces se
hace días después del pesaje.

**Anular** (`fiscal_anular`) solo se permite **el mismo día de la emisión**, comparado en fecha de
negocio de Honduras y no con la hora del servidor. Exige motivo y dónde quedó resguardada la copia
física. El número **no se libera**: el documento queda en estado `anulado`, se reimprime con
`*** ANULADO ***` y su motivo, y sigue apareciendo en el libro. Después del día de emisión se corrige
con una nota (§9). Un documento con notas vigentes **no se puede anular**: primero se anulan ellas.

Cada emisión, anulación, alta o cambio de CAI y **cada reimpresión** queda en `FiscalAuditLog`, con
el formato usado. Como el número no se reasigna nunca, lo auditable de una reimpresión es cuántas
veces se imprimió y cómo.

---

## 8. Reportes fiscales

En **Reportes → Fiscal**, con el mismo rango de fechas que las demás pestañas (hay atajos *Este mes*
y *Mes pasado*, porque el libro es mensual):

| Vista | Qué muestra |
| --- | --- |
| **Libro de compras** | Un renglón por boleta de compra, por fecha de emisión |
| **Libro de ventas** | Igual, con las facturas |
| **Pendientes de emitir** | Compras, ventas y molidos del período sin documento, con los días que llevan así |
| **Estado del CAI** | Rango consumido, disponibles, próximo número, días para vencer y por qué no puede emitir, si es el caso |

Tres cosas que conviene saber al leer el libro:

- **Se ordena por fecha de emisión**, no por la de la compra o la venta. La fecha de la operación va
  en su propia columna.
- **Los anulados aparecen y no suman.** Tienen que estar para que la numeración se lea completa; su
  monto va aparte, en "Anulado (no suma)".
- **Avisa de los números que faltan** entre el primero y el último del período, por CAI. No es
  necesariamente un error —una hoja dañada del talonario lo explica— pero es lo primero que se
  pregunta en una revisión.

Las cuatro vistas se **exportan a Excel** con el botón *Exportar a Excel*: un archivo con una hoja por
tabla —Totales primero—, los montos como número para poder sumarlos, y la fila de encabezados fija. Los
dos libros y los pendientes se pueden descargar **también en CSV**, que es el formato que se carga en
otro sistema contable.

Las notas de crédito y débito **sí entran al libro**, con su signo: la de crédito resta y la de débito
suma. Cada una entra al libro del documento que corrige, y la columna `Modifica` dice a cuál, porque un
renglón en negativo sin referencia no se puede explicar.

---

## 9. Notas de crédito y débito

Son **la única forma de corregir un documento después del día de emisión**, porque anular está
limitado al mismo día. La nota **no toca el documento original** —lo emitido es inmutable—: se suma o
se resta en el libro.

Se emiten desde la misma fila de Compras, Ventas o Molido, con el botón **Nota de crédito o débito**.
Piden tipo, monto y motivo; el monto viene propuesto con el saldo completo, que es el caso más común.

| Regla | Por qué |
| --- | --- |
| Tiene **su propia serie** y su propio CAI | El SAR autoriza un rango por tipo de documento: la contadora carga el CAI de `nota_credito` (y el de `nota_debito` si se usa) igual que el de la factura |
| **Motivo obligatorio** | Es lo que explica la nota en una revisión. Lo exige la validación y también un `CHECK` de la base |
| **No se puede acreditar más de lo facturado** | El techo es lo que queda del documento: su total, más las notas de débito, menos las de crédito ya emitidas. Una nota anulada devuelve el saldo |
| Puede ser **parcial** | Acreditar la mitad acredita la mitad de cada renglón: si el original llevaba ISV —el molido—, la nota lleva su parte |
| **No sobre otra nota**, ni sobre un documento anulado | Corregir una corrección enreda el libro; un documento anulado ya no declara nada |
| Se imprime en los dos formatos | 80 mm y A4, y la hoja dice **qué documento modifica**, con su número y su fecha |

Emitirlas tiene permiso propio, **`fiscal_nota`**, por omisión solo admin: una nota de crédito rebaja
un ingreso ya declarado, así que pesa lo mismo que anular.

Lo que la nota **no** hace: no mueve inventario ni cambia la transacción. Si una devolución de café
implica además un movimiento de bodega, ese se registra aparte.

---

## 10. Lo que el sistema NO hace

| No hace | Qué implica |
| --- | --- |
| **Retenciones IHCAFE** | Fuera de alcance por decisión del 27/09/2026. Si deben salir en el documento, cambian el total impreso |
| **Guía de remisión** | Fuera de alcance: antes hay que modelar el traslado de café entre bodegas |
| **Facturar en otra moneda** | `moneda` y `tipoCambio` están en el modelo, pero todo se emite en HNL |
| **Un documento por varias transacciones** | Un documento ampara **una** compra, venta o molido (decisión del 27/09/2026) |
| **Declaraciones ante el SAR** | Los reportes son el insumo de la contadora, no una declaración |
| **Numerar las ventas en el talonario** | `numeroFactura` es solo de compras, y hoy solo tiene sentido para lo histórico |
| **Hoja de facturación por productor** | Pendiente: el detalle línea por línea de un productor en el formato con el que se le liquida |

---

## 11. Cómo activar la facturación autorizada

1. La contadora consigue la autorización del SAR y **carga el CAI** en Mantenimiento → Facturación:
   código, tipo de documento, los tres códigos del número, rango, fecha límite y modo.
2. Revisar el **próximo número** que muestra el panel antes de emitir el primero: es la forma de
   detectar un código mal tecleado sin gastar un número.
3. Dar los permisos: `fiscal_emitir`, `fiscal_anular` y `fiscal_nota` se configuran por rol en
   Mantenimiento → Roles. No aparecen en el menú, son solo permisos.
4. Elegir el **formato de impresión** por omisión (80 mm o A4) en Mantenimiento → Facturación.
5. Emitir una de prueba y verificar en el papel el número, el CAI, el rango y la fecha límite.

---

## 12. Dónde está cada cosa en el código

| Archivo | Qué hace |
| --- | --- |
| `lib/fiscal.ts` | Catálogos y reglas puras: tipos de documento, clasificaciones e ISV, formato del número, evaluación del CAI, plazo de anulación, desglose |
| `lib/fiscal-cai.ts` | DTO del CAI con el estado del rango derivado en cada lectura |
| `lib/fiscal-document.ts` | Emisión (con el bloqueo de fila), notas de crédito y débito, anulación, bitácora, bloqueo de edición (`assertSinDocumentoFiscal`) |
| `lib/fiscal-reports.ts` | Libro de compras y ventas, pendientes de emitir, saltos de numeración, columnas del CSV |
| `lib/csv.ts` | El CSV: BOM, comillas, protección de fórmulas |
| `lib/xlsx.ts`, `lib/report-exports.ts` | El Excel: una hoja por tabla, con el formato de cada columna |
| `lib/build-invoice.ts` | Datos de la factura: desde el snapshot si el documento está emitido, si no de los datos vivos. Formatea el correlativo interno |
| `lib/build-ticket.ts` | Convierte esos mismos datos al ticket: los dos formatos leen una sola fuente |
| `lib/thermal-printer.ts` | Buffers ESC/POS: ticket (dos copias, bloque fiscal) y resumen del día |
| `lib/print-formats.ts`, `lib/use-print-invoice.ts` | El catálogo de formatos y el hook que imprime en el elegido |
| `components/invoice-a4.tsx` | La hoja: maquetación, CSS de impresión y las dos copias |
| `components/invoice-print-buttons.tsx` | "Imprimir factura" en el formato por omisión, más el otro formato |
| `components/fiscal-document-actions.tsx` | Emitir, anular y emitir notas desde Compras, Ventas y Molido |
| `components/maintenance-fiscal-panel.tsx` | Mantenimiento → Facturación: CAI y formato por omisión |
| `components/fiscal-reports-panel.tsx` | Reportes → Fiscal: los dos libros, pendientes, estado del CAI y la descarga |
| `app/api/fiscal-cais/*`, `app/api/fiscal-documents/*` | Administración del CAI, emisión, anulación y notas (`:id/nota`) |
| `app/api/reports/fiscal/libro`, `.../pendientes`, `.../cais` | Los reportes, en JSON, Excel (`formato=xlsx`) o CSV |
| `app/print/{compra,venta,molido}/[id]/page.tsx` | Las páginas de factura A4, con su control de acceso |
| `app/print/nota/[id]/page.tsx` | La hoja A4 de una nota. El id es el del **documento**, no de una transacción |
| `app/api/print/ticket/route.ts` | Encola el `PrintJob` del ticket y registra la reimpresión |
| `app/api/print/agent/*` | Endpoints del agente local. Se autentica con `PRINT_AGENT_TOKEN` |
| `prisma/schema.prisma` | `FiscalCai`, `FiscalDocument`, `FiscalAuditLog`, `numeroInterno`, `Producto.clasificacionFiscal`, `CompanySettings.formatoImpresionDefault` |

**Migraciones relacionadas:**

| Migración | Qué trajo |
| --- | --- |
| `20260915000000_invoice_number_and_fiscal_base` | `PurchaseTransaction.numeroFactura` y los cuatro campos fiscales de `CompanySettings` (hoy históricos) |
| `20260925000000_add_numero_interno` | `numeroInterno` en compras y ventas: secuencia, único y backfill en orden de creación |
| `20260927000000_add_fiscal_base` | Las tres tablas fiscales, el índice parcial de un CAI activo por tipo, los `CHECK` y los `RESTRICT` |
| `20260928000000_add_print_format` | `CompanySettings.formatoImpresionDefault` |
| `20260929000000_add_fiscal_notas` | `documentoOrigenId` y `notaMotivo`, con el `CHECK` de referencia reemplazado: o una transacción, o un documento corregido |
| `20260930000000_add_adquiriente_exonerado` | `Client.registroExonerado` y `FiscalDocument.ordenCompraExenta` |

**Pruebas:** `tests/lib/fiscal.test.ts` (reglas del CAI, desglose y notas), `tests/lib/fiscal-reports.test.ts`
y `tests/lib/csv.test.ts` (libro, pendientes y exportación), `tests/lib/build-invoice.test.ts`,
`tests/components/invoice-a4.test.tsx`, `tests/lib/ticket-copias.test.ts`, y contra Postgres de
verdad `tests/integration/fiscal-{constraints,emision,reportes,notas}.test.ts`.

---

## 13. Estado y pendientes

- **Las migraciones fiscales deben aplicarse a la base de la operación** (`prisma migrate deploy`):
  `20260925000000_add_numero_interno`, `20260927000000_add_fiscal_base`,
  `20260928000000_add_print_format`, `20260929000000_add_fiscal_notas` y
  `20260930000000_add_adquiriente_exonerado`. La primera crea una columna `NOT NULL`, así que sin ella
  fallan las consultas de compras y ventas.
- **La contadora tiene que confirmar** el tipo de documento que corresponde a las compras y su código
  de dos dígitos (`TT`), además del formato y las leyendas exactas que exige el SAR. Lo mismo para las
  notas: su código `TT` y si una **boleta de compra** se corrige con nota de crédito o de otra forma.
  El sistema lo permite; que sea lo correcto ante el SAR es lo que hay que confirmar.
- Falta ver impreso el corte entre las dos copias, tanto en A4 como en la térmica, y el ticket fiscal
  en la impresora real.
- Fuera de alcance por decisión del 27/09: retenciones IHCAFE —cambiarían el total impreso— y guía de
  remisión, que antes exige modelar el traslado de café entre bodegas.
- Para el detalle de decisiones de diseño, ver `DOCUMENTACION.md` §6.14 (reportes fiscales), §10.1
  (ticket), §10.2 (factura A4 y numeración), §10.3 (emisión, anulación y formatos), §10.4 (notas) y
  §19.3 (por qué el número del talonario se captura a mano).
