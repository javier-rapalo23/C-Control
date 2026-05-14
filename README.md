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
```

Puedes usar `.env.example` como base.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Correr localmente

```bash
npm install
cp .env.example .env
# Edita DATABASE_URL en .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
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
npm run vercel-build
```

6. (Recomendado) Verifica que la base de Railway tenga aplicadas las migraciones con:

```bash
npx prisma migrate deploy
```

7. Despliega y valida `/api/health`.
