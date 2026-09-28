# Facturación fiscal SAR — revisión del estado actual y plan

Respuesta a `facturacion-sar-c-control.md`. Revisado contra el código del 27 de septiembre de 2026
(rutas de `facturacion-fiscal.md` §9, esquema Prisma, validaciones, middleware y pruebas).
**No se escribió código.**

Las respuestas del 27 de septiembre ya están incorporadas: §8 tiene las decisiones y §8b lo que
sigue pendiente. El plan y el esquema de abajo ya reflejan un solo CAI por empresa, el molido
facturado con ISV 15 %, la anulación el mismo día y la guía de remisión fuera de alcance.

---

## 1. Los hallazgos de la especificación: confirmados

| § | Hallazgo | Estado |
| --- | --- | --- |
| 1.1 | La secuencia de Postgres no sirve para el correlativo fiscal | **Confirmado.** `numeroInterno` usa `@default(autoincrement())`; un rollback consume el número y deja hueco. Para el interno es aceptable (así está documentado); para el fiscal no |
| 1.2 | El CAI no puede ser texto libre en un registro único | **Confirmado.** `CompanySettings` es `id = "singleton"` y los cuatro campos son `String @default("")`, validados solo por longitud (50/40 caracteres) |
| 1.3 | Borrar transacciones no puede seguir existiendo | **Confirmado**, y son **cinco** rutas, no una (ver §2.2) |
| 1.4 | La factura se arma con datos actuales | **Confirmado.** `buildInvoiceForPurchase/Sale` leen la transacción y hacen `companySettings.upsert` en cada impresión: nada quedó guardado de lo emitido |
| 1.5 | `facturable` hoy no tiene efecto | **Confirmado el hallazgo, descartado el requisito.** Se decidió que **se factura todo** (§8, pregunta 4), así que en vez de hacer que `facturable` tuviera efecto, se eliminó del código |

Sobre 1.1, un detalle a favor del enfoque propuesto: con el contador en la fila del CAI y
`SELECT ... FOR UPDATE`, una emisión que falla **no consume número** porque el rollback devuelve el
contador. Es justo el criterio de aceptación §9.2.

---

## 2. Lo que la especificación no cubre y hay que decidir antes

### 2.1 El molido se factura, no tiene documento hoy, y es lo único gravado

`GrindingService` (§6.12 de `DOCUMENTACION.md`) cobra por moler café **del cliente**: es ingreso por
**servicio**, no venta de café. Hoy no imprime nada — ni ticket ni A4, no existe ese camino— y
`lib/reports.ts` ya lo reporta aparte (`getGrindingReport`).

Esto choca con el supuesto de §3 de la especificación ("casi todo caiga en exento"): la exoneración
del Acuerdo 352-2022 es para el café, no para un servicio de maquila.

**Ya se decidió que el molido se factura** (§8, pregunta 16), así que esto entra al alcance y trae
tres consecuencias:

1. El documento fiscal debe poder colgar de un `GrindingService`, no solo de una compra o una venta.
2. La clasificación fiscal deja de ser siempre `EXENTO`: el molido es **gravado 15 %**, y el desglose
   de totales pasa a tener números de verdad, no ceros.
3. **Hay que construir la impresión del molido desde cero.** No existe ni ticket ni A4 para ese
   ingreso; hoy solo se registra y se reporta. Es trabajo que no estaba en la especificación.

Falta un dato para calcular: **el monto que se escribe a mano, ¿ya incluye el ISV o no?** (§8b).

### 2.2 Bloquear la edición son cinco rutas, y una debe seguir permitida

Ninguna ruta actualiza montos de una transacción, pero cuatro borran y una modifica:

| Ruta | Qué hace | Con documento emitido |
| --- | --- | --- |
| `DELETE /api/purchase-transactions/:id` | Borra la compra completa (líneas en cascada) | **Bloquear** |
| `DELETE /api/purchases/:id` | Borra **una línea** y recalcula el total de la cabecera | **Bloquear**: cambiaría el total de un documento ya emitido |
| `DELETE /api/sale-transactions/:id` | Borra la venta completa | **Bloquear** |
| `DELETE /api/sales/:id` | Borra una línea de venta y recalcula | **Bloquear** |
| `PATCH /api/pending-payments/:id` (pagar / deshacer) | Escribe `pagoFecha`, `pagoMetodo`, `pagoRegistradoPor`, `pagadoEn` | **Permitir**: liquidar una compra pendiente no cambia el documento, solo cuándo salió el efectivo |

El patrón para esto ya existe en el proyecto: `assertCashOpen(db, fecha, sucursalId)` es el punto
único que bloquea las fechas con caja cerrada y lanza `CashClosedError`, que la API traduce a
**409 `CASH_CLOSED`**. Propongo el gemelo `assertSinDocumentoFiscal(db, transactionId)` →
`DocumentoEmitidoError` → **409 `FISCAL_DOCUMENT_ISSUED`**, llamado desde las cuatro rutas de borrado.

Y una red de seguridad que no depende de que nadie olvide llamarla: la relación
`FiscalDocument → PurchaseTransaction` con **`onDelete: Restrict`**. Así, aunque una ruta futura se
olvide del assert, la base rechaza el borrado.

### 2.3 Los valores fiscales actuales no se pueden migrar automáticamente

- `facturaRangoDesde` / `facturaRangoHasta` son texto tipo `000-001-01-00000001`, que ya incluye
  establecimiento, punto de emisión y tipo de documento. Al estructurarlo, el rango pasa a ser solo
  el **correlativo** (los 8 dígitos finales) y los otros tres segmentos son configuración. Parsear
  esos strings a ciegas es adivinar; si alguien escribió el rango con otro formato, la migración
  metería basura en el nuevo modelo.
- `facturaFechaLimite` es texto (`31/12/2027`). Al pasar a `DateTime @db.Date` hay que decidir la
  zona horaria: el sistema fija la fecha de negocio en `America/Tegucigalpa` y construye fechas como
  medianoche UTC (`lib/business-date.ts`). El vencimiento debe compararse con el mismo criterio, o
  un documento se podrá emitir un día después de vencido.

**Decidido** (§8, pregunta 10): no se migra nada automáticamente. La contadora carga el CAI en el
panel nuevo y los valores viejos quedan como legado de solo lectura. Por eso el panel debe validar de
entrada —rango numérico, desde ≤ hasta, fecha real— y no aceptar texto libre como hoy: es la única
defensa contra un error de tecleo en el dato del que después cuelga toda la numeración.

### 2.4 La guía de remisión queda fuera de alcance

La especificación la lista para "traslados de café", pero el sistema **no modela traslado de café
entre bodegas**: `CashTransfer` mueve **efectivo**, y `ProductoCarga` es carga/descarga de inventario
dentro de una sucursal. Antes de la guía habría que modelar el traslado de producto, que es trabajo
aparte.

**Decidido** (§8, pregunta 17): se deja para después. El catálogo de tipos de documento la admite
cuando se necesite, sin cambiar el modelo.

### 2.5 Prerrequisitos de prueba — **resueltos** (queda crear la base)

La especificación pide tests en cada fase y, en §9.1, **100 emisiones concurrentes**. Dos obstáculos:

1. **Jest no corre en este entorno.** `node_modules` mezcla instalación npm y pnpm: hay un
   `node_modules/jest-mock` real en 30.3.0 que tapa el 30.4.1 del lockfile, y `jest-runtime` 30.4.2
   llama a una función que la 30.3.0 no tiene. Todas las suites fallan antes de ejecutar una sola
   prueba. Se arregla borrando `node_modules` (y `package-lock.json`, porque el proyecto usa pnpm) y
   reinstalando.
2. **No hay pruebas con base de datos.** Las actuales usan dobles de Prisma (`tests/lib/ledger`,
   `payroll`, `reports`). Un test de concurrencia **necesita Postgres real**: el bloqueo de fila no
   se puede simular con un doble. Hace falta una base de pruebas (contenedor local o base aparte en
   Railway) y un proyecto Jest separado que corra en serie.

**Ya hecho** (ver Fase 0). Jest corre: 16 suites y 131 pruebas en verde, y el arnés de integración
está montado y se salta solo si no hay base configurada. Al arreglar Jest apareció un fallo que
llevaba tiempo oculto: el doble de Prisma de `tests/lib/ledger.test.ts` no tenía
`purchaseTransaction.groupBy`, que el ledger empezó a usar con el desglose por forma de pago. Se
corrigió el doble y se agregaron dos pruebas que faltaban —el cobro del molido y las compras
pendientes liquidadas en efectivo—.

Lo único que falta es **crear la segunda base en Railway** y pegar su URL en `.env.test`.

### 2.6 Otros detalles verificados

- **Ya no existe la venta sin producto.** `createSaleLineSchema` exige `productoId`; solo quedan
  filas históricas con `productoNombre` nulo, que la factura imprime como "Venta". El desglose fiscal
  tiene que tolerar esas filas viejas.
- **No hay dependencia para Excel.** Las de producción son `@prisma/client`, `dotenv`,
  `lucide-react`, `next`, `prisma`, `react`, `react-dom`, `zod`. La exportación de §8 es CSV (sin
  dependencia nueva) o agregar algo como `exceljs`.
- **Los permisos por acción no existen hoy, y hacen falta dos cosas.** `ModuleAccess` guarda roles
  por módulo, pero solo se hace cumplir en **páginas**: `requireModuleAccess` vive en un server
  component y responde con `redirect`, que en una ruta de API no sirve. Las rutas de API se autorizan
  hoy solo por método en `middleware.ts` (`DELETE` → admin, `POST/PUT/PATCH` → editor, más reglas por
  ruta como `/api/cash-sessions/reopen`). Como se decidió que la anulación se gestione por permisos
  (§8, pregunta 14), hay que agregar:
  1. Un guardián para rutas de API que devuelva **403** en vez de redirigir.
  2. Entradas de permiso que no son módulos navegables (`fiscal_emitir`, `fiscal_anular`): hoy
     `MODULE_DEFS` asume que cada entrada tiene página y sale en el menú.
- **El catálogo cerrado en `lib/`** es la convención del proyecto para este tipo de listas
  (`lib/expenses.ts`, `lib/payment-methods.ts`, `lib/coffee-types.ts`): tipos de documento y
  clasificaciones fiscales van ahí como `String` validado por Zod, no como `enum` de Prisma.

---

## 3. Plan por fases

Cada fase deja el sistema desplegable y el flujo actual funcionando sin CAI configurado
(criterio 9.7).

### Fase 0 — Prerrequisitos — **hecha**

- [x] **Jest arreglado.** Se borró `node_modules` y `package-lock.json` y se reinstaló con pnpm: el
      `jest-mock` 30.3.0 que dejó npm era el que tapaba al 30.4.1 del lockfile. `pnpm test` queda en
      16 suites y 131 pruebas.
- [x] **Doble de Prisma del ledger corregido** y dos pruebas nuevas (molido y pendientes) que no
      existían (§2.5).
- [x] **Arnés de integración.** `jest.config.ts` ahora tiene dos proyectos: `unit` (con dobles, es lo
      que corre `pnpm test`) e `integration` (base real, `pnpm test:integration`, en serie).
- [x] **Base de pruebas en Railway** configurada en `.env.test`, con las migraciones aplicadas
      (`pnpm test:db:migrate`) y las tres pruebas de integración en verde.
- [x] **Salvaguarda probada:** con `TEST_DATABASE_URL` igual a la URL de `.env`, el script aborta sin
      llegar a correr `prisma migrate deploy`.

**Cómo queda configurado:**

| Comando | Qué hace |
| --- | --- |
| `pnpm test` | Solo las unitarias. Es lo que tiene que estar verde siempre |
| `pnpm test:integration` | Las que tocan base real, en serie. **Se saltan** si no hay `.env.test`, así que no rompen a quien no la tenga |
| `pnpm test:db:migrate` | Aplica las migraciones a la base de pruebas, sin tocar la de `.env` |

Aplicar las migraciones a esa base sirvió además para **probar la migración
`20260925000000_add_numero_interno` contra Postgres de verdad** —secuencia, backfill e índice único—,
que hasta ahora no se había ejecutado en ningún lado. En la base de la operación sigue pendiente.

La base de pruebas se declara como **`TEST_DATABASE_URL`** en `.env.test` (hay un
`.env.test.example` versionado; `.env.test` está en `.gitignore`). El nombre es distinto de
`DATABASE_URL` a propósito, y además el arnés **aborta si las dos URL coinciden**: el `.env` de esta
máquina apunta a la base de Railway de la operación, y estas pruebas borran datos.

### Fase 1 — Modelo fiscal y administración del CAI — **hecha** (no emite todavía)

- Tablas nuevas: `FiscalCai`, `FiscalDocument`, `FiscalAuditLog`. **Sin `PuntoEmision`**: con un solo
  CAI por empresa, el establecimiento y el punto de emisión son campos del CAI.
- Catálogo de tipos de documento y clasificaciones fiscales en `lib/fiscal.ts`, con el ISV por
  clasificación (café `EXENTO`, servicio de molido `GRAVADO_15`).
- `Producto.clasificacionFiscal` (`EXENTO` por defecto).
- Panel de Mantenimiento: alta de CAI, códigos, modo `TALONARIO`/`SISTEMA`, estado del rango
  (usados, disponibles, días para vencer) y alertas configurables. **Lo usa la contadora**, así que
  valida rango numérico, desde ≤ hasta y fecha real, y muestra cómo quedará el número formateado
  antes de guardar.
- Guardián de permisos para rutas de API (403) y entradas de permiso sin página, que hoy no existen
  (§2.6).
- Las columnas fiscales de `CompanySettings` quedan como legado de solo lectura.
- **Salida:** se puede registrar el CAI real con datos estructurados y validados. Nada emite aún.

**Cómo quedó:**

| Pieza | Dónde |
| --- | --- |
| Catálogos y reglas (tipos, ISV, formato del número, `evaluarCai`) | `lib/fiscal.ts` |
| Modelos + migración aditiva con índice parcial y `CHECK` | `prisma/migrations/20260927000000_add_fiscal_base` |
| DTO y estado derivado del rango | `lib/fiscal-cai.ts`, `types/domain.ts` |
| API | `GET/POST /api/fiscal-cais`, `PATCH/DELETE /api/fiscal-cais/:id` |
| Guardián de permisos para rutas de API (403) | `lib/require-api-module-access.ts` |
| Permisos configurables sin pantalla | `fiscal_emitir`, `fiscal_anular` en `lib/modules.ts` |
| Panel para la contadora | Mantenimiento → Facturación (`components/maintenance-fiscal-panel.tsx`) |
| Pruebas | `tests/lib/fiscal.test.ts` (10) y `tests/integration/fiscal-constraints.test.ts` (4) |

Verificado: `pnpm test` 17 suites / 141 pruebas, `pnpm test:integration` 7 pruebas contra Postgres
real, `pnpm build`, typecheck y lint sin errores. Las pruebas de integración comprueban las defensas
que viven en la base: un solo CAI activo por tipo, rango al revés rechazado, contador fuera de rango
rechazado, documento que ampare exactamente una transacción, correlativo único por CAI y el
`RESTRICT` que impide borrar una transacción ya documentada.

**Lo que falta para que esto sirva de verdad** es la Fase 2: sin emisión, el panel solo guarda datos.

### Fase 2 — Emisión, anulación y bloqueo

Van juntas a propósito: bloquear el borrado sin tener anulación deja al usuario sin salida cuando se
equivoque.

- `POST /api/fiscal-documents`: valida CAI vigente y rango disponible, asigna correlativo con
  `SELECT ... FOR UPDATE`, formatea `EEE-PPP-TT-CCCCCCCC`, calcula el desglose de ISV, guarda el
  snapshot y marca la transacción. **Fecha de emisión = hoy, no editable** (§8.11). Sirve para
  compras, ventas y molido, incluidas las compras aún sin pagar.
- Modo `TALONARIO`: el número se captura a mano, validando rango y no repetido.
- `POST /api/fiscal-documents/:id/anular`: motivo obligatorio, **solo el mismo día de la emisión**,
  conserva el número y registra dónde quedó archivada la copia física.
- `assertSinDocumentoFiscal` en las cuatro rutas de borrado + `onDelete: Restrict`.
- Bitácora de emisión, anulación, reimpresión y alta/cambio de CAI.
- Permisos separados y **configurables** desde Mantenimiento: emitir y anular por su cuenta, con
  admin como valor por omisión para anular.
- **Salida:** criterios 9.1 a 9.4 y 9.6 demostrados con pruebas.

### Fase 3 — Impresión desde el snapshot

- `buildInvoiceFromSnapshot` y refactor de `build-invoice.ts`: con documento emitido se imprime el
  snapshot; sin documento, el camino actual.
- Bloque fiscal desde el CAI del snapshot, no de `CompanySettings`.
- Rótulos: comprobante interno sin emitir, `ANULADO` sobre el anulado.
- Desglose básico impreso: importe exento, gravado 15 %, ISV 15 % y total (§8, pregunta 18). Las
  columnas de 18 % quedan en el modelo pero no se imprimen.
- **Las dos fechas en el documento**: fecha de emisión y fecha de la compra o del pesaje (§8.11).
- **Impresión del molido**, que hoy no existe: es documento nuevo, no un ajuste al existente.
- `formatoVersion` en el snapshot, para que un cambio de maquetación no altere la lectura de un
  documento viejo.
- **Salida:** criterio 9.5.

### Fase 4 — Reportes fiscales

- Libro de compras y libro de ventas por período, con anulados.
- Pendientes de emitir y estado de CAI.
- Exportación (CSV, salvo que se quiera la dependencia de Excel).

### Fase 5 — Condicionales, según respuestas

- Retenciones IHCAFE (configurables, con vigencia por cosecha). **Fuera de alcance por ahora** por
  decisión del 27/09; entra acá si después deben salir en el documento.
- Notas de crédito y débito: son lo que permite corregir un documento **después** del día de emisión,
  ya que la anulación quedó limitada al mismo día. Mientras no existan, un error detectado al día
  siguiente no tiene salida dentro del sistema.
- Guía de remisión, fuera de alcance por ahora; **antes** exige modelar el traslado de café (§2.4).

---

## 4. Cambios propuestos al `schema.prisma`

Bosquejo para discutir, no definitivo. Montos en `Decimal`, fechas de negocio en `@db.Date`.

```prisma
/// Un CAI con su rango. Hay uno activo por tipo de documento; el establecimiento y
/// el punto de emisión son campos de aquí y no una tabla aparte, porque toda la
/// empresa emite con un solo CAI (decisión §8, pregunta 9).
model FiscalCai {
  id                    String   @id @default(cuid())
  /// Catálogo cerrado de `lib/fiscal.ts`: boleta_compra, factura, nota_credito…
  tipoDocumento         String
  codigo                String   @unique     // el CAI
  codigoEstablecimiento String               // 3 dígitos (EEE)
  codigoPuntoEmision    String               // 3 dígitos (PPP)
  rangoDesde            Int                  // solo el correlativo (CCCCCCCC)
  rangoHasta            Int
  fechaLimite           DateTime @db.Date
  /// TALONARIO (número a mano) | SISTEMA (autoimpresor).
  modo                  String
  estado                String   @default("activo") // activo | agotado | vencido | inactivo
  /// Contador transaccional. El próximo número es este + 1, asignado con
  /// SELECT ... FOR UPDATE: un rollback lo devuelve y no deja hueco.
  ultimoCorrelativo     Int      @default(0)
  alertaPorcentaje      Int      @default(80)
  alertaDiasPrevios     Int      @default(30)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  documentos            FiscalDocument[]

  @@index([tipoDocumento, estado])
}

model FiscalDocument {
  id                    String   @id @default(cuid())
  caiId                 String
  tipoDocumento         String
  correlativo           Int
  /// EEE-PPP-TT-CCCCCCCC, ya formateado.
  numeroCompleto        String   @unique
  estado                String   @default("emitido") // emitido | anulado
  businessDate          DateTime @db.Date
  emitidoEn             DateTime @default(now())
  emitidoPor            String
  /// Exactamente uno de los tres, y cada uno a lo sumo una vez: un documento
  /// ampara una compra específica (decisión §8, pregunta 5). Restrict es lo que
  /// impide borrar en la base una transacción con documento emitido, aunque una
  /// ruta olvide el assert.
  purchaseTransactionId String?  @unique
  saleTransactionId     String?  @unique
  grindingServiceId     String?  @unique
  total                 Decimal  @db.Decimal(12, 2)
  /// Previsto para una eventual factura de exportación. Hoy siempre HNL y nulo.
  moneda                String   @default("HNL")
  tipoCambio            Decimal? @db.Decimal(12, 6)
  importeExento         Decimal  @default(0) @db.Decimal(12, 2)
  importeExonerado      Decimal  @default(0) @db.Decimal(12, 2)
  importeGravado15      Decimal  @default(0) @db.Decimal(12, 2)
  importeGravado18      Decimal  @default(0) @db.Decimal(12, 2)
  isv15                 Decimal  @default(0) @db.Decimal(12, 2)
  isv18                 Decimal  @default(0) @db.Decimal(12, 2)
  /// Copia inmutable de lo impreso: emisor, cliente, líneas, totales y datos del
  /// CAI. Reimprimir usa esto, nunca los datos vivos.
  snapshot              Json
  formatoVersion        String
  anuladoEn             DateTime?
  anuladoPor            String?
  anulacionMotivo       String?
  /// Resguardo de la copia física del anulado (decisión §8, pregunta 15).
  copiaFisicaResguardada Boolean @default(false)
  copiaFisicaUbicacion   String?
  cai                   FiscalCai @relation(fields: [caiId], references: [id], onDelete: Restrict)
  purchaseTransaction   PurchaseTransaction? @relation(fields: [purchaseTransactionId], references: [id], onDelete: Restrict)
  saleTransaction       SaleTransaction?     @relation(fields: [saleTransactionId], references: [id], onDelete: Restrict)

  @@unique([caiId, correlativo])
  @@index([businessDate])
  @@index([estado])
}

model FiscalAuditLog {
  id               String   @id @default(cuid())
  /// emision | anulacion | reimpresion | cai_alta | cai_cambio
  accion           String
  fiscalDocumentId String?
  caiId            String?
  usuario          String
  detalle          Json?
  createdAt        DateTime @default(now())

  @@index([fiscalDocumentId])
  @@index([createdAt])
}
```

Además:

- `Producto.clasificacionFiscal String @default("EXENTO")`. El molido no es un producto, así que su
  clasificación (`GRAVADO_15`) sale del catálogo del tipo de línea en `lib/fiscal.ts`.
- `moneda` y `tipoCambio` ya van en `FiscalDocument` desde la Fase 1, aunque todavía no se facture en
  dólares: así no hay que migrar documentos emitidos el día que se exporte.
- `PurchaseTransaction`, `SaleTransaction` y `GrindingService`: relación inversa
  `fiscalDocument FiscalDocument?`.
- **Índice parcial en SQL crudo** (Prisma no lo expresa): un solo CAI activo por tipo de documento —
  `CREATE UNIQUE INDEX ... ON "FiscalCai"("tipoDocumento") WHERE "estado" = 'activo'`.
- **Restricción `CHECK`** de que exactamente una de las tres referencias esté presente, igual que el
  `CHECK` de `CashTransfer`.

---

## 5. Estrategia de migración

Aditiva y en dos tiempos, para que un rollback no pierda datos.

1. **Migración 1 (Fase 1), solo aditiva:** tablas nuevas, `Producto.clasificacionFiscal` con
   `DEFAULT 'EXENTO'`, índice parcial y `CHECK` en SQL crudo. Nada existente cambia; los despliegues
   viejos siguen funcionando.
2. **Sin backfill del CAI.** Decidido en §8: la contadora lo carga en el panel nuevo. Las columnas de
   `CompanySettings` quedan intactas y el bloque fiscal actual sigue saliendo de ellas hasta la
   Fase 3.
3. **`numeroFactura` histórico se conserva como legado.** No se convierte en `FiscalDocument` ni se
   importa: se arranca a emitir desde cero y lo viejo queda como dato de consulta.
4. **Migración 2 (Fase 3),** cuando el panel nuevo ya esté en uso: dejar de leer las columnas viejas.
5. **Migración 3 (fase posterior),** solo tras confirmar que nadie las lee: eliminar `cai`,
   `facturaRangoDesde`, `facturaRangoHasta`, `facturaFechaLimite` de `CompanySettings`, y renombrar
   `numeroFactura` a `numeroFacturaLegacy`.
6. **Producción** aplica con `prisma migrate deploy` (ya está en `vercel-build`). Las migraciones con
   SQL crudo se escriben a mano, como ya se hizo con `20260823000000`.

---

## 6. Cómo se cumple cada regla obligatoria (§6 de la especificación)

| Regla | Mecanismo |
| --- | --- |
| Correlativo sin saltos ni duplicados | Contador en la fila del CAI + `SELECT ... FOR UPDATE` dentro de `prisma.$transaction`, más `@@unique([caiId, correlativo])` como red |
| Formato `EEE-PPP-TT-CCCCCCCC` | Se arma del punto de emisión + tipo + correlativo; `numeroCompleto` se guarda ya formateado y único |
| No emitir vencido ni agotado | Validación en la emisión, dentro de la misma transacción del bloqueo; el vencimiento se compara en `America/Tegucigalpa` |
| Alertas de rango y vencimiento | `alertaPorcentaje` y `alertaDiasPrevios` por CAI; endpoint de estado y aviso en el panel |
| No editar ni borrar lo emitido | `assertSinDocumentoFiscal` en las cuatro rutas + `onDelete: Restrict` en la base |
| Anulación conserva número | `estado = 'anulado'` sobre la misma fila; el número nunca se libera. Solo el mismo día de la emisión, y con registro de dónde quedó la copia física |
| Bitácora | `FiscalAuditLog`, escrito en la misma transacción que la acción |
| Montos en `Decimal` | Ya es la convención del proyecto; ninguna columna nueva usa `Float` |
| Conservación 5 años | No hay purga; `scripts/reset-movimientos.mjs` **debe excluir** las tablas fiscales (hoy borra todos los movimientos) |
| Permisos separados | Entradas `fiscal_emitir` y `fiscal_anular` en `ModuleAccess`, configurables desde Mantenimiento, más un guardián de API que responda 403 (hoy solo existe el de páginas, que redirige) |
| Fecha de emisión cronológica | La fecha de emisión es la real y no se edita, así que el orden de los números coincide con el de las fechas (§8.11) |

---

## 7. Riesgos técnicos

- **Bloqueo de fila en serverless.** `FOR UPDATE` serializa las emisiones del mismo CAI. Al volumen
  del negocio no es problema, pero conviene mantener la transacción corta (validar, asignar, guardar)
  y **no** meter dentro la impresión ni el armado del PDF.
- **Pool de conexiones.** Varias instancias de Vercel contra Postgres en Railway: transacciones
  largas agotan el pool. Es otra razón para dejar el snapshot armado antes de abrir la transacción.
- **Zona horaria del vencimiento** (§2.3): el criterio tiene que ser el mismo de
  `lib/business-date.ts`, o habrá un día de diferencia.
- **Snapshot y formato.** Guardar datos y no HTML mantiene el snapshot liviano, pero un cambio de
  maquetación cambia cómo se ve un documento viejo. Por eso `formatoVersion`; si se quiere fidelidad
  absoluta, habría que guardar el HTML o un PDF, y eso es otra decisión.
- **Emisión y caja cerrada.** Resuelto en §8.11: emitir no se bloquea por caja cerrada, porque no
  mueve efectivo, igual que las cargas de inventario. Lo que sigue bloqueado es lo que mueve dinero.
- **La anulación limitada al mismo día deja un hueco operativo** hasta que existan las notas de
  crédito: un error detectado al día siguiente no tiene corrección posible dentro del sistema. Vale
  la pena confirmar con la contadora si eso es aceptable en el arranque.

---

## 8. Decisiones tomadas (respuestas del 27 de septiembre)

| # | Pregunta | Decisión | Qué cambia en el diseño |
| --- | --- | --- | --- |
| 4 (spec) | ¿Compra mixta: solo las líneas facturables? | **Se factura todo**; la distinción se elimina | Se quitó `facturable` y `esCategoriaFacturable` del código, del DTO y de las tres parrillas. La categoría se queda para el reporte y el modo oro |
| 5 (spec) | ¿Un documento cubre una o varias compras? | **Una compra específica** | Se confirma la relación 1 a 1 (`purchaseTransactionId @unique`); no hace falta tabla intermedia (§4) |
| 3 (spec) | ¿Retenciones IHCAFE? | **Fuera de alcance por ahora**; se verá más adelante | El documento al productor no las muestra ni las descuenta. Nada en el modelo las impide después |
| Molido | ¿El monto incluye ISV? | **Ya lo incluye** | El desglose se calcula hacia atrás: base = monto ÷ 1.15, ISV = monto − base. El total impreso no cambia respecto de lo que hoy se cobra |
| 2 (spec) | ¿Posibilidad de exportar? | **Sí, se deja preparado** | `moneda` y `tipoCambio` entran al modelo desde la Fase 1 (§4) |
| 9 | ¿Un CAI por bodega o uno central? | **Un solo CAI por empresa** | Se elimina la tabla `PuntoEmision`: establecimiento y punto de emisión son campos del propio CAI (§4) |
| 10 | ¿Qué pasa con los `numeroFactura` históricos? | Se arranca con datos nuevos; **los históricos quedan como legado** | Sin backfill ni script de importación (§5) |
| 12 | ¿Se emite una compra pendiente antes de pagarla? | **Sí, al momento** | Emitir no depende de `pagoFecha`; liquidar después no toca el documento |
| 14 | ¿Plazo de anulación y quién autoriza? | **Mismo día**, y quién puede se **gestiona por permisos** | Validación de plazo en la anulación + permiso configurable, no admin fijo (§6) |
| 15 | ¿Se conserva y registra la copia física del anulado? | **Sí** | Campos de resguardo en `FiscalDocument` (§4) |
| 16 | ¿Se factura el molido? | **Sí** | Deja de ser condicional: entra al modelo, al cálculo de ISV 15 % y necesita camino de impresión, que hoy no existe (§2.1) |
| 17 | ¿Guía de remisión? | **Fuera de alcance por ahora** | Se saca del plan; el modelo no se cierra a agregarla |
| 18 | ¿Desglose de totales? | **Los básicos** | Se imprime exento, gravado 15 %, ISV 15 % y total; las columnas de 18 % quedan en el modelo sin imprimirse |
| 19 | ¿Registro aparte si el productor emite su propia factura? | **No** | Sin cambios |
| 20 | ¿Quién consigue y carga el CAI? | **La contadora** obtiene los rangos y los ingresa en la aplicación | El panel de CAI tiene que ser usable por ella, con validación que atrape errores de tecleo (§3, Fase 1) |

### 11. Fecha de emisión — mi recomendación

Preguntaste si emitir con fecha anterior a hoy es buena práctica. **No lo es**, y propongo esta regla:

- **La fecha de emisión es siempre hoy y no se edita.** Es lo que hace que la numeración salga en
  orden cronológico: con fecha editable, el documento `...00000050` podría quedar fechado antes que
  el `...00000049`, y eso es exactamente lo que el SAR revisa.
- **La compra sí puede ser de días anteriores.** Es el caso real del negocio: se pesa y se paga hoy,
  el papel se hace después. El documento lleva **las dos fechas**: fecha de emisión (hoy) y fecha de
  la compra o del pesaje. Así nadie interpreta que se emitió con atraso encubierto.
- **La caja cerrada no bloquea emitir.** Emitir no mueve dinero, y el sistema ya distingue eso: las
  cargas de inventario (`ProductoCarga`) no se bloquean por caja cerrada porque son movimientos de
  producto, no de efectivo. Un documento fiscal es el mismo caso. Lo que sigue bloqueado por caja
  cerrada es lo que mueve efectivo: compras, ventas, gastos y la liquidación de pendientes.

Si preferís que emitir también respete la caja cerrada, se hace con una línea (`assertCashOpen` en la
emisión), pero dejaría compras viejas sin poder documentarse nunca.

### 13. Número consumido — regla asumida

No la respondiste; la doy por decidida porque es la única compatible con "sin saltos", y avisá si no:

**El número nunca se devuelve.** Ni por fallo de impresora, ni por error de red, ni porque el papel
salga en blanco. Si la impresión falla, se **reimprime el mismo número** y la reimpresión queda en
bitácora. Devolver el número obligaría a reasignarlo, y dos documentos distintos podrían terminar con
el mismo número si uno de los dos ya se imprimió.

Lo que sí resuelve el error real es la **anulación**: el número queda usado y marcado como anulado.

---

## 8b. Pendientes

**El modelo de datos ya no tiene pendientes bloqueantes:** con la relación 1 a 1 confirmada y la
moneda prevista, la Fase 1 se puede construir. Lo que queda condiciona fases posteriores.

> Nota sobre la relación 1 a 1: la "hoja de facturación por productor" (§19.4 de `DOCUMENTACION.md`)
> queda entonces como **reporte**, no como documento fiscal que agrupe compras. Si algún día se
> quisiera facturar varias compras juntas, sería una migración sobre documentos ya emitidos.

### Fase 2 — sin pendientes

Las tres preguntas que la bloqueaban están respondidas (§8). Queda anotado el criterio de cálculo:

- **Todas las líneas entran al documento.** Ya no hay tipos de café que se documenten aparte.
- **El molido trae el ISV incluido**, así que el desglose va hacia atrás: `base = monto ÷ 1.15` e
  `ISV = monto − base`, redondeando la base y dejando el ISV como la diferencia, para que base + ISV
  dé exactamente el monto cobrado y el documento no descuadre por un centavo.
- **Sin retenciones IHCAFE.** Si después van en el documento, cambian el total impreso; el modelo no
  las impide.

### Bloquea la Fase 3 (impresión)

- **Pregunta 7: ¿el ticket térmico es documento fiscal o sigue siendo comprobante interno?** Si es
  fiscal, hay que decidir qué se imprime cuando de la misma transacción salen ticket y A4: no pueden
  ser dos documentos con el mismo número sin marcar cuál es original y cuál copia.
- **Pregunta 1: tipo de documento para las compras (boleta de compra o factura) y su código `TT`.**
  No bloquea el modelo porque es configurable, pero sin esto no se puede emitir de verdad. Lo trae la
  contadora junto con el CAI.
- **Pregunta 18, formato exacto:** "los básicos" me sirve para avanzar; el formato y las leyendas
  vigentes los confirma la contadora antes de producción.

### Ya resuelto

- **Exportación:** se deja preparado. `moneda` (`HNL` por defecto) y `tipoCambio` entran al modelo
  desde la Fase 1. Facturar en dólares de verdad —qué tipo de cambio se usa, de dónde sale, cómo se
  imprime— es trabajo de una fase posterior; lo que se evita ahora es la migración.

---

## 9. Lo que no puedo validar

Las bases legales de la especificación (Acuerdo 481-2017, Acuerdo Ejecutivo 352-2022, Decretos
297-2002, 56-2007 y 143-2008), el tipo de documento correcto para las compras, el formato exigido y
el tratamiento de las retenciones IHCAFE **no los verifiqué**: no tengo forma de consultar la
normativa vigente desde aquí. El plan los toma como dato de entrada y los deja configurables —tipo
de documento, códigos, leyendas, conceptos de retención— justamente para que una corrección del
contador no obligue a cambiar el modelo.
