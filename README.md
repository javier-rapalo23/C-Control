# R Control Fullstack

Proyecto fullstack listo para produccion con:

- Next.js (App Router) + React + TypeScript
- API REST con Route Handlers en `app/api`
- Prisma + PostgreSQL
- Preparado para deploy en Vercel + Railway

## Variables de entorno

Archivo `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB_NAME?schema=public"
# Obligatorio en produccion: firma las cookies de sesion.
# Generar con: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
SESSION_SECRET="..."
# El control de acceso viene activo por defecto; solo hace falta para desactivarlo.
RBAC_ENABLED="true"
RBAC_USERS_JSON='{"operador1":{"role":"editor","password":"operador123"},"consulta1":{"role":"viewer","password":"consulta123"}}'
```

Puedes usar `.env.example` como base.

## Seguridad por roles y usuarios (RBAC)

La API ahora soporta control de acceso por usuario y rol.

- Login web en `/login` con usuario y contraseña
- La sesion se guarda en una cookie HttpOnly llamada `rcontrol_user`, cuyo valor es un token firmado con HMAC-SHA256 que incluye usuario, rol y expiracion (`lib/session.ts`). Requiere `SESSION_SECRET`.
- Clientes no web: usar el `token` que devuelve `POST /api/auth/login` y enviarlo como `Authorization: Bearer <token>`. La cabecera `x-user-id` ya no autentica.
- Los usuarios `admin` deben crearse en Mantenimiento > Usuarios (tabla `User` en la base de datos). No existe ningun usuario admin por defecto ni hardcodeado: `RBAC_USERS_JSON`/`lib/auth.ts` solo deben usarse para cuentas de prueba de rango `editor`/`viewer`/`comprador`.
- Las contrasenas de la tabla `User` se guardan hasheadas con scrypt (`lib/password.ts`). Las contrasenas legacy en texto plano se siguen aceptando y se convierten a hash en el primer login; `pnpm hash-passwords` hace el backfill completo de una pasada.
- Jerarquia de roles: `viewer < editor < admin`

Reglas por endpoint/metodo:

- `GET` requiere rol `viewer` o superior
- `POST` requiere rol `editor` o superior
- `DELETE` requiere rol `admin`
- `GET /api/export` requiere `admin`
- `POST /api/ledger/initial-balance` requiere `admin`
- `GET /api/health` es publico

Ejemplo de llamada desde app movil:

```http
POST /api/auth/login
Content-Type: application/json

{ "userId": "operador1", "password": "operador123" }
```

```http
POST /api/purchases
Authorization: Bearer <token devuelto por el login>
Content-Type: application/json
```

Sin token valido la API responde `401 UNAUTHORIZED`; con un rol insuficiente, `403 FORBIDDEN`.

Para la autenticacion web, el endpoint `POST /api/auth/login` valida usuario y contrasena, y `POST /api/auth/logout` cierra la sesion.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio
```

## Correr localmente

```bash
pnpm install
cp .env.example .env
# Edita DATABASE_URL en .env
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

## Endpoints

- GET `/api/health`
- GET `/api/productos`
- POST `/api/productos`
- GET `/api/ledger?businessDate=YYYY-MM-DD`
- POST `/api/ledger/initial-balance`
- POST `/api/purchases`
- POST `/api/sales`
- POST `/api/expenses`
- DELETE `/api/purchases/:id`
- DELETE `/api/sales/:id`
- DELETE `/api/expenses/:id`
- GET `/api/export`

## Importar data historica

Endpoint: `POST /api/import` (requiere rol `admin`).

> Nota: el contrato JSON de este endpoint mantiene los campos `materials`/`materialId`/`material` por compatibilidad con archivos históricos existentes (ver ejemplo abajo), aunque el resto de la app ya usa la terminología "producto".

Acepta dos formatos:

- JSON directo con `materials` y `ledgers`
- Texto completo exportado (como el contenido de `Chatarrerastz.txt`), aunque tenga mas de un bloque JSON

Ejemplo:

```http
POST /api/import
x-user-id: admin
Content-Type: application/json

{
	"materials": [
		{ "id": "cobre", "nombre": "Cobre", "precioPorLibra": 70 }
	],
	"ledgers": [
		{
			"businessDate": "2026-05-21",
			"saldoInicial": 17000,
			"purchases": [
				{ "materialId": "cobre", "material": "Cobre", "precioPorLibra": 70, "libras": 1.5 }
			],
			"sales": [
				{ "descripcion": "Venta muestra", "monto": 100 }
			],
			"expenses": [
				{ "categoria": "Operativo", "descripcion": "Prueba", "monto": 50 }
			]
		}
	]
}
```
## Deploy Vercel + Railway

1. Crea una base PostgreSQL en Railway.
2. Copia la URL de conexion (DATABASE_URL).
3. En Vercel, importa este repositorio.
4. Configura variable de entorno `DATABASE_URL` en Vercel.
5. En Build Command de Vercel usa:

```bash
pnpm vercel-build
```

6. (Recomendado) Verifica que la base de Railway tenga aplicadas las migraciones con:

```bash
pnpm prisma migrate deploy
```

7. Despliega y valida `/api/health`.
