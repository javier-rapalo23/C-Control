**Resumen del contrato API — R-ControlWeb**

Propósito: documentar los endpoints disponibles, formato de petición/respuesta, y requisitos de autenticación para que la app móvil pueda integrarse con el backend.

**Formato de respuesta**
- Todas las rutas devuelven el tipo `ApiResponse<T>`:
  - Éxito: `{ ok: true, data: T }`
  - Error: `{ ok: false, error: { code, message, details? } }`

**Autenticación / RBAC**
- Mecanismo: cookie `rcontrol_user` (HttpOnly) que se crea al hacer `POST /api/auth/login`.
- Alternativa para clientes no web: enviar cabecera `x-user-id: <userId>` en cada request.
- Control de acceso (middleware): activar con `RBAC_ENABLED=true`. Usuarios/roles se configuran en `RBAC_USERS_JSON` (JSON string).
- Roles: `viewer` < `editor` < `admin`.
  - `GET` normalmente requiere `viewer`.
  - `POST/PUT/PATCH` requieren `editor`.
  - `DELETE` y rutas sensibles (`/api/import`, `/api/export`, `/api/ledger/initial-balance`) requieren `admin`.
- El middleware añade en la respuesta `x-auth-user-id` y `x-auth-role`.

**Variables de entorno relevantes**
- `RBAC_ENABLED` (true/false) — habilita comprobación RBAC en middleware.
- `RBAC_USERS_JSON` — JSON con usuarios y roles/contraseñas (opcional, hay usuarios por defecto en `lib/auth`).
- `NODE_ENV` — usado para marcar cookie `secure` en producción.
- `DATABASE_URL` — conexión a la base de datos (usada por Prisma).

---

## Endpoints principales

- `POST /api/auth/login`  
  - Body: `{ userId: string, password: string }`  
  - Success: `{ ok: true, data: { userId, role } }` + HttpOnly cookie `rcontrol_user` set.

- `GET /api/auth/me`  
  - Devuelve `{ ok: true, data: { userId: string | null, role: string | null } }`.

- `POST /api/auth/logout`  
  - Borra cookie `rcontrol_user`.

- `GET /api/materials`  
  - Lista materiales: cada item incluye `id`, `nombre`, `precioPorLibra`, `createdAt`, `updatedAt`.
- `POST /api/materials`  
  - Crea material. Payload validado por `createMaterialSchema`.

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
  - Registra venta. Body validado por `createSaleSchema`.

- `POST /api/expenses`  
  - Registra gasto. Body validado por `createExpenseSchema`.

- `GET /api/ledger?businessDate=YYYY-MM-DD`  
  - Devuelve el `ledger` (totales, compras, ventas, gastos) para la fecha.

- `GET /api/export?businessDate=YYYY-MM-DD`  
  - Exporta lote completo (dailyBalances, purchases, sales, expenses, materials, clients, purchaseTransactions, syncEvents).

- `POST /api/import`  
  - Importa payload con `materials` y `ledgers` (ver `app/api/import/route.ts`).
  - IMPORTANT: la ruta elimina (`deleteMany`) compras, transacciones, ventas y gastos por `businessDate` antes de reinsertar las filas del payload — por tanto el payload debe contener exactamente las fechas/datos que se quieren reemplazar.

- `GET /api/materials/stock?from=YYYY-MM-DD&to=YYYY-MM-DD`  
  - Si no se envía `materialId`, devuelve totales por material en el rango.
- `GET /api/materials/stock?materialId=ID&from=...&to=...`  
  - Devuelve `totalLibras`, `daily` (libras por día) y `purchases` listadas.

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
- Autenticación: para pruebas rápidas enviar `x-user-id` en requests (útil para la app móvil en desarrollo). En producción migrar a un flow con login y cookie o a tokens si prefieres (añadir `/api/auth/refresh` si usas tokens).
- Consumir endpoints concretos en lugar de un único endpoint genérico de sincronización para evitar borrados accidentales (especialmente evitar `POST /api/import` a menos que el payload sea exacto).
- Cargar `materials`, `clients` y `ledger` en el startup de la app móvil; usar `GET /api/materials` y `GET /api/clients`.
- Para enviar compras/ventas/gastos usar `POST /api/purchases`, `POST /api/purchase-transactions`, `POST /api/sales`, `POST /api/expenses` según corresponda.

---

Archivo generado automáticamente por la tarea Fase 0: mapear y documentar endpoints. Mantener actualizado en `docs/api-contract.md`.
