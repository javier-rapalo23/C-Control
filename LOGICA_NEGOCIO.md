# Logica de negocio actual de RControl

Este documento resume la logica de negocio que tiene implementada la aplicacion hoy. La app funciona sobre SQLite local y mantiene un libro diario por fecha de negocio.

## 1. Modelo general

La aplicacion administra 4 bloques principales:

- Productos
- Compras
- Ventas
- Gastos

Todo se organiza por `businessDate` y cada dia tiene su propio balance.

La ecuacion base del balance es:

`saldoActual = saldoInicial + totalVentas - totalCompras - totalGastos`

## 2. Entidades principales

### Producto

Representa un producto recuperable o comprable.

Campos principales:

- `id`
- `nombre`
- `precioPorLibra`

Reglas:

- El nombre no puede ir vacio.
- El precio por libra debe ser mayor que 0.
- Si no hay productos creados, la app carga una lista por defecto.

### DailyLedger

Es el resumen diario de cada fecha de negocio.

Campos principales:

- `businessDate`
- `saldoInicial`
- `saldoActual`
- `totalCompras`
- `totalVentas`
- `totalGastos`
- `purchases`
- `sales`
- `expenses`

### Compra legacy

Es el modelo historico de compras de un solo producto por registro.

Campos principales:

- `id`
- `businessDate`
- `fecha`
- `productoId`
- `producto`
- `precioPorLibra`
- `libras`
- `total`

### Cliente

Se agrego para el flujo nuevo de cuentas por cliente.

Campos principales:

- `id`
- `nombre`

### Transaccion de compra por cliente

Es el modelo nuevo para registrar varios productos dentro de una sola compra asociada a un cliente.

Estructura actual:

- `purchase_transactions`: cabecera de la compra por cliente.
- `purchase_items`: lineas o items del carrito.

## 3. Flujo de compras actual

La pantalla de compras hoy soporta dos niveles de operacion:

### A. Flujo legacy

Todavia existe el registro de una compra individual de un producto.

Reglas:

- Debe existir un producto seleccionado.
- Las libras deben ser mayores que 0.
- La compra se guarda en SQLite.
- Luego se recalcula el balance diario.

### B. Flujo por cliente con carrito

Este es el flujo nuevo.

Proceso:

1. Se crea o selecciona un cliente.
2. Se selecciona un producto.
3. Se ingresa la cantidad de libras.
4. El item se agrega al carrito.
5. Se pueden agregar varios productos antes de guardar.
6. Al registrar la compra, se guarda una transaccion completa por cliente.

Reglas:

- El cliente es obligatorio.
- El carrito debe tener al menos un item.
- Cada item debe tener producto valido, precio mayor que 0 y libras mayores que 0.
- Al registrar, se recalcula el balance diario.

Compatibilidad actual:

- Cuando se guarda una compra por cliente, la app tambien sigue escribiendo compras en el esquema legacy para no romper el dashboard ni los calculos actuales.

## 4. Flujo de ventas

Las ventas siguen siendo simples y directas.

Reglas:

- La descripcion es obligatoria.
- El monto debe ser mayor que 0.
- La venta se guarda por fecha de negocio.
- Se recalcula el balance diario despues del guardado.

## 5. Flujo de gastos

Los gastos siguen la misma logica que las ventas, pero con categoria.

Reglas:

- La categoria es obligatoria.
- La descripcion es obligatoria.
- El monto debe ser mayor que 0.
- El gasto se guarda por fecha de negocio.
- Se recalcula el balance diario despues del guardado.

## 6. Saldos diarios

La app maneja saldo inicial por fecha de negocio.

Reglas:

- El saldo inicial no puede ser negativo.
- Si una fecha aun no existe, se crea automaticamente con saldo en cero.
- Cada movimiento afecta el balance de su propia fecha.

## 7. Recalculo de balance

Cada vez que se crea, elimina o actualiza una operacion, la app:

- Verifica que exista el balance del dia.
- Calcula los totales del dia.
- Reescribe `saldo_actual`.

Esto evita que el balance quede desincronizado con respecto a compras, ventas y gastos.

## 8. Exportacion de datos

La exportacion actual construye un payload con:

- productos
- ledgers diarios
- fecha/hora de exportacion

La app primero intenta copiar el JSON al portapapeles para que el usuario lo pueda pegar donde quiera.

## 9. Migracion de compras antiguas

Se agrego un flujo de migracion seguro para pasar del modelo legacy al modelo por cliente.

Proceso:

1. Se genera un backup JSON automatico.
2. El backup se guarda internamente.
3. El JSON tambien se copia al portapapeles.
4. Se crea un cliente general si hace falta.
5. Se convierten las compras antiguas a transacciones e items.

Regla importante:

- La migracion esta pensada para ser segura e idempotente. Si ya existe una migracion previa, no vuelve a duplicar la estructura nueva.

## 10. Persistencia local

La app usa SQLite local como fuente de verdad actual.

Tablas principales:

- `productos`
- `daily_balances`
- `purchases`
- `sales`
- `expenses`
- `clients`
- `purchase_transactions`
- `purchase_items`
- `migration_backups`

## 11. Pantallas y responsabilidad

### Dashboard

- Muestra resumen diario.
- Agrupa compras por producto.
- Muestra resumen reciente.
- Permite exportar datos.

### Compras

- Administra saldo inicial.
- Permite crear y editar productos.
- Permite registrar compras legacy.
- Permite registrar compras por cliente con carrito.
- Permite migrar compras antiguas al nuevo modelo.

### Ventas

- Registra ventas simples por fecha.

### Gastos

- Registra gastos simples por fecha.

## 12. Regla de compatibilidad actual

La app esta en una etapa hibrida:

- El modelo nuevo por cliente ya existe.
- El modelo legacy aun se conserva para no romper el flujo diario ya usado por la app.

Esto significa que hoy conviven ambos esquemas mientras se completa la evolucion funcional y la migracion de toda la UI a cuentas por cliente.
