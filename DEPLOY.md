# Guía de Despliegue

## Requisitos

- Cuenta en [GitHub](https://github.com)
- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Railway](https://railway.app)
- Base de datos PostgreSQL (Railway proporciona)

## Paso 1: Crear Repositorio en GitHub

```bash
# Inicializar Git localmente (si no está hecho)
git init
git add .
git commit -m "Initial commit: Next.js + Prisma + PostgreSQL project"

# Crear repo remoto en GitHub
# 1. Ve a https://github.com/new
# 2. Nombre: r-control-api
# 3. Descripción: Control diario de compras, ventas y gastos
# 4. Público o Privado (tu preferencia)
# 5. NO inicialices con README (ya tienes uno)
# 6. Copia el comando para añadir el remoto

git remote add origin https://github.com/TU_USUARIO/r-control-api.git
git branch -M main
git push -u origin main
```

## Paso 2: Configurar Base de Datos en Railway

1. Ve a [railway.app](https://railway.app)
2. Inicia sesión / Crea cuenta
3. Crea un nuevo proyecto
4. Añade un plugin de PostgreSQL
5. Copia la `DATABASE_URL` desde la sección de "Variables"
   - Formato: `postgresql://usuario:contraseña@host:puerto/base_datos?schema=public`

## Paso 3: Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com)
2. Importa tu repositorio desde GitHub
3. En la configuración:
   - **Framework**: Next.js
   - **Root Directory**: ./
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
4. Añade variables de entorno:
   - `DATABASE_URL` = (la URL de Railway copiada en Paso 2)
   - `SESSION_SECRET` = **obligatoria**; sin ella no se emiten sesiones y nadie puede entrar.
     Generar con: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `RBAC_USERS_JSON` = `{}` (recomendado). En producción las cuentas de prueba de `lib/auth.ts`
     no existen aunque no se declare nada; ponerlo explícito lo deja claro para quien lea la
     configuración. Ver la sección 8.6 de DOCUMENTACION.md.
5. Despliega (Deploy)

## Paso 4: Ejecutar Migraciones

Después de que Vercel construya y despliegue, necesitas ejecutar las migraciones:

### Opción A: Desde la línea de comandos local
```bash
# Asegurate que DATABASE_URL apunta a tu DB de Railway
export DATABASE_URL="postgresql://...tu_url..."
npm run prisma:migrate
```

### Opción B: Desde Railway (recomendado)
1. En Railway, crea un nuevo servicio desde tu repo de GitHub
2. En el tab de "Deploy", en la sección "Start Command", ingresa:
   ```
   npx prisma migrate deploy
   ```
3. Ejecuta el servicio una vez para aplicar las migraciones
4. Cancela el servicio después (no lo necesitas ejecutando continuamente)

### Opción C: Manual en Railway CLI
```bash
# Instala Railway CLI
npm install -g @railway/cli

# Conecta con tu proyecto
railway login
railway link

# Ejecuta migraciones
railway run npx prisma migrate deploy
```

## Paso 5: Crear el Primer Usuario Admin

No existe ningún admin por defecto ni hardcodeado, así que un despliegue nuevo no tiene forma de
entrar a Mantenimiento hasta que se cree uno. Con `DATABASE_URL` apuntando a la base de Railway:

```bash
pnpm create-admin --user javier --name "Javier Orellana"
```

Imprime una contraseña aleatoria **una sola vez** y la guarda hasheada con scrypt. Anótala y
cámbiala desde Mantenimiento > Usuarios tras el primer ingreso.

Para elegir la contraseña sin dejarla en el historial del shell:

```bash
pnpm create-admin --user javier --password-stdin
```

Otras opciones: `--list` (usuarios, roles y estado), `--reset` (restablece la contraseña de un
usuario existente y lo reactiva), `--role` (por defecto `admin`).

## Paso 6: Verificar Despliegue

1. Ve a tu URL de Vercel (ej: `https://r-control-api.vercel.app`)
2. Debe cargar el Dashboard
3. Verifica `/api/health` → debe devolver `{"ok":true,...}`
4. Inicia sesión con el admin del Paso 5

## Solución de Problemas

### Error: "Cannot fetch data from service"
- Verifica que `DATABASE_URL` esté correctamente configurada en Vercel
- Asegúrate de haber ejecutado `npm run prisma:migrate`
- En Railway, chequea que el servicio de PostgreSQL esté activo

### Error: "Invalid prisma.xxx invocation"
- Probablemente no se ejecutaron las migraciones
- Ve al Paso 4 y elige una opción para ejecutar migraciones

### Cambios locales no reflejados
- Haz commit y push a GitHub
- Vercel redesplegará automáticamente

## Scripts Útiles

```bash
# Desarrollo local
npm run dev

# Compilar para producción
npm run build

# Iniciar servidor de producción
npm run start

# Ejecutar tests
npm run test

# Ver datos en la BD
npm run prisma:studio

# Ejecutar migraciones locales
npm run prisma:migrate

# Generar cliente Prisma
npm run prisma:generate

# Crear o restablecer un usuario admin
npm run create-admin -- --user <userId> --name "<Nombre>"
npm run create-admin -- --list
```

## Estructura del Proyecto

```
r-control-api/
├── app/                    # Next.js App Router
│   ├── api/               # Endpoints REST
│   ├── layout.tsx         # Layout principal con navegación
│   ├── page.tsx           # Dashboard
│   ├── purchases/         # Página de compras
│   ├── sales/             # Página de ventas
│   └── expenses/          # Página de gastos
├── components/            # Componentes React
├── lib/                   # Utilidades (Prisma, validaciones, etc.)
├── prisma/                # Schema y migraciones
├── types/                 # TypeScript types
├── tests/                 # Tests
├── package.json           # Dependencias
├── tsconfig.json          # Configuración TypeScript
├── vercel.json            # Configuración Vercel
└── railway.json           # Configuración Railway
```

## URLs de Referencia

- [Documentación Next.js](https://nextjs.org/docs)
- [Documentación Prisma](https://www.prisma.io/docs)
- [Documentación Vercel](https://vercel.com/docs)
- [Documentación Railway](https://railway.app/docs)
