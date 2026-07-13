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
RBAC_ENABLED="false"
RBAC_USERS_JSON='{"admin":{"role":"admin","password":"admin123"},"operador1":{"role":"editor","password":"operador123"},"consulta1":{"role":"viewer","password":"consulta123"}}'
```

Puedes usar `.env.example` como base.

## Seguridad por roles y usuarios (RBAC)

La API ahora soporta control de acceso por usuario y rol.

- Login web en `/login` con usuario y contraseña
- La sesion se guarda en una cookie HttpOnly llamada `rcontrol_user`
- Header requerido cuando RBAC esta activo para llamadas directas: `x-user-id`
- Usuarios permitidos, rol y contrasena se definen en `RBAC_USERS_JSON`
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
POST /api/purchases
x-user-id: operador1
Content-Type: application/json
```

Si el usuario no existe en `RBAC_USERS_JSON`, la API responde `403 FORBIDDEN`.

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
