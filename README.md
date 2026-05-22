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
RBAC_USERS_JSON='{"admin":"admin","operador1":"editor","consulta1":"viewer"}'
```

Puedes usar `.env.example` como base.

## Seguridad por roles y usuarios (RBAC)

La API ahora soporta control de acceso por usuario y rol.

- Header requerido cuando RBAC esta activo: `x-user-id`
- Usuarios permitidos y rol se definen en `RBAC_USERS_JSON`
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
- GET `/api/materials`
- POST `/api/materials`
- GET `/api/ledger?businessDate=YYYY-MM-DD`
- POST `/api/ledger/initial-balance`
- POST `/api/purchases`
- POST `/api/sales`
- POST `/api/expenses`
- DELETE `/api/purchases/:id`
- DELETE `/api/sales/:id`
- DELETE `/api/expenses/:id`
- GET `/api/export`

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
