**Resumen del contrato API — R-ControlWeb**

Propósito: documentar los endpoints disponibles, formato de petición/respuesta, y requisitos de autenticación para que la app móvil pueda integrarse con el backend.

**Formato de respuesta**
- Todas las rutas devuelven el tipo `ApiResponse<T>`:
  - Éxito: `{ ok: true, data: T }`
  - Error: `{ ok: false, error: { code, message, details? } }`

**Autenticación / RBAC**
- Mecanismo: `POST /api/auth/login` devuelve `{ userId, role, token, expiresAt }` y setea la cookie HttpOnly `rcontrol_user`. El valor es un token firmado con HMAC-SHA256 que lleva dentro `userId`, `role` y `exp`.
- Clientes no web: guardar `data.token` y enviarlo en cada request como `Authorization: Bearer <token>`.
- ⚠️ La cabecera `x-user-id` **ya no autentica**. Era una afirmación sin verificar: cualquiera podía declararse `admin`. Los clientes que la usaban deben migrar al flujo de login + `Bearer`.
- El token caduca a los 7 días; al recibir `401` hay que volver a hacer login.
- Control de acceso (middleware): **activo por defecto**; se desactiva con `RBAC_ENABLED=false`. Los roles salen del token, que el login emite a partir del usuario de la tabla `User` (o de `RBAC_USERS_JSON` como respaldo).
- Roles: `viewer` < `editor` < `admin`.
  - `GET` normalmente requiere `viewer`.
  - `POST/PUT/PATCH` requieren `editor`.
  - `DELETE` y rutas sensibles (`/api/import`, `/api/export`, `/api/ledger/initial-balance`) requieren `admin`.
- El middleware añade en la respuesta `x-auth-user-id` y `x-auth-role`.

**Variables de entorno relevantes**
- `SESSION_SECRET` — clave que firma las sesiones (HMAC-SHA256). Obligatoria en producción: sin ella no se emiten sesiones.
- `RBAC_ENABLED` (true/false) — control de acceso en el middleware; **activo por defecto**.
- `RBAC_USERS_JSON` — JSON con usuarios y roles/contraseñas (opcional, hay usuarios por defecto en `lib/auth`).
- `NODE_ENV` — usado para marcar cookie `secure` en producción.
- `DATABASE_URL` — conexión a la base de datos (usada por Prisma).

---

## Endpoints principales

- `POST /api/auth/login`  
  - Body: `{ userId: string, password: string }`  
  - Success: `{ ok: true, data: { userId, role, token, expiresAt } }` + HttpOnly cookie `rcontrol_user` set.

- `GET /api/auth/me`  
  - Devuelve `{ ok: true, data: { userId: string | null, role: string | null } }`.

- `POST /api/auth/logout`  
  - Borra cookie `rcontrol_user`.

- `GET /api/productos`  
  - Lista productos: cada item incluye `id`, `nombre`, `precioPorLibra`, `createdAt`, `updatedAt`.
- `POST /api/productos`  
  - Crea producto. Payload validado por `createProductoSchema`.

- `GET /api/clients`  
  - Lista clientes (incluye cliente "General").
- `POST /api/clients`  
  - Crea cliente.

- `POST /api/purchases`  
  - Crea una compra simple (item). Body validado por `createPurchaseSchema`.
- `DELETE /api/purchases/:id`  
  - Elimina compra por id (recalcula balances).

- `GET /api/purchase-transactions?businessDate=YYYY-MM-DD`  
  - Lista transacciones completas del día (con `client` e `items`).
- `POST /api/purchase-transactions`  
  - Crea transacción compuesta (múltiples items). Payload validado por `createPurchaseTransactionSchema`.
- `DELETE /api/purchase-transactions/:id`  
  - Elimina transacción completa (recalcula balances).

- `POST /api/sales`  
  - Registra venta simple (sin producto). Body validado por `createSaleSchema`.

- `GET /api/sale-transactions?businessDate=YYYY-MM-DD`  
  - Lista transacciones de venta del día (con `client` e `items` de producto/libras/precio).
- `POST /api/sale-transactions`  
  - Crea transacción de venta compuesta (múltiples items de producto). Payload validado por `createSaleTransactionSchema`.
- `DELETE /api/sale-transactions/:id`  
  - Elimina transacción de venta completa (recalcula balances y stock).

- `POST /api/expenses`  
  - Registra gasto. Body validado por `createExpenseSchema`.

- `GET /api/ledger?businessDate=YYYY-MM-DD`  
  - Devuelve el `ledger` (totales, compras, ventas, gastos) para la fecha.

- `GET /api/export?businessDate=YYYY-MM-DD`  
  - Exporta lote completo (dailyBalances, purchases, sales, expenses, productos, clients, purchaseTransactions, syncEvents).

- `POST /api/import`  
  - Importa payload con `materials` y `ledgers` (ver `app/api/import/route.ts`).
  - Nota: este endpoint mantiene el contrato JSON legacy (`materials`/`materialId`/`material`) por compatibilidad con archivos históricos existentes, aunque el modelo interno ya se llama `Producto`.
  - IMPORTANT: la ruta elimina (`deleteMany`) compras, transacciones, ventas y gastos por `businessDate` antes de reinsertar las filas del payload — por tanto el payload debe contener exactamente las fechas/datos que se quieren reemplazar.

- `GET /api/productos/stock?from=YYYY-MM-DD&to=YYYY-MM-DD`  
  - Si no se envía `productoId`, devuelve totales por producto en el rango.
- `GET /api/productos/stock?productoId=ID&from=...&to=...`  
  - Devuelve `totalLibras` (stock neto: compras − ventas del producto), `daily` (libras netas por día) y las listas `purchases`/`sales`.

- `GET /api/health`  
  - Health check minimal.

---

## Formato y ejemplos rápidos

- Ejemplo `ApiResponse` éxito:

  {
    "ok": true,
    "data": { ... }
  }

- Ejemplo error:

  {
    "ok": false,
    "error": { "code": "NOT_FOUND", "message": "Client not found" }
  }

---

## Notas de integración móvil (recomendaciones)
- Autenticación: hacer `POST /api/auth/login` al arrancar, guardar `data.token` de forma segura y enviarlo como `Authorization: Bearer <token>`. Renovar con otro login cuando la API responda `401` o cuando se acerque `expiresAt`.
- Consumir endpoints concretos en lugar de un único endpoint genérico de sincronización para evitar borrados accidentales (especialmente evitar `POST /api/import` a menos que el payload sea exacto).
- Cargar `productos`, `clients` y `ledger` en el startup de la app móvil; usar `GET /api/productos` y `GET /api/clients`.
- Para enviar compras/ventas/gastos usar `POST /api/purchases`, `POST /api/purchase-transactions`, `POST /api/sales`, `POST /api/expenses` según corresponda.

---

Archivo generado automáticamente por la tarea Fase 0: mapear y documentar endpoints. Mantener actualizado en `docs/api-contract.md`.
