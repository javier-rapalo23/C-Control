/**
 * Borra todo el movimiento registrado y deja los catálogos en pie.
 *
 * Sirve para arrancar una temporada en cero después de un piloto o una capacitación:
 * los datos de prueba no se pueden dejar conviviendo con los reales —ensucian los
 * acumulados, los arqueos y los reportes—, y borrarlos a mano en el orden correcto
 * es fácil de equivocar.
 *
 * **Borra**: compras, ventas, gastos, ingresos de caja, sesiones de caja, saldos
 * diarios, cargas de inventario, asistencia, adelantos, pagos de planilla y la cola
 * de impresión. También los productos que quedaron fuera del catálogo de café
 * (`lib/coffee-types.ts`) una vez que ya no tienen movimientos.
 *
 * **Conserva**: sucursales, clientes, bancos, empleados, usuarios, permisos por
 * módulo, datos de la empresa y los tipos de café del catálogo.
 *
 *   node scripts/reset-movimientos.mjs --dry-run
 *       Muestra qué borraría, sin escribir nada.
 *
 *   node scripts/reset-movimientos.mjs --si-borrar-todo
 *       Ejecuta. El flag es largo a propósito: esto no se deshace.
 *
 * El orden de borrado respeta las llaves foráneas: lo que apunta a otra cosa se va
 * primero. Los pagos y adelantos de planilla van antes que los gastos porque cada
 * uno cuelga de un `Expense`, y borrarlos al revés dejaría planillas apuntando a un
 * gasto que ya no existe.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const CATALOGO = [
  'pergamino húmedo',
  'pergamino mojado',
  'pergamino seco',
  'uva',
  'requema',
  'verde',
  'guacuco',
  'repaso',
];

const dryRun = process.argv.includes('--dry-run');
const confirmado = process.argv.includes('--si-borrar-todo');

if (!dryRun && !confirmado) {
  console.error('Esto borra todo el movimiento y no se deshace.');
  console.error('  node scripts/reset-movimientos.mjs --dry-run         para ver qué haría');
  console.error('  node scripts/reset-movimientos.mjs --si-borrar-todo  para ejecutarlo');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const pasos = [
    ['PayrollAdvanceApplication', prisma.payrollAdvanceApplication],
    ['EmployeePayment', prisma.employeePayment],
    ['EmployeeAdvance', prisma.employeeAdvance],
    ['Attendance', prisma.attendance],
    ['Purchase', prisma.purchase],
    ['PurchaseTransaction', prisma.purchaseTransaction],
    ['Sale', prisma.sale],
    ['SaleTransaction', prisma.saleTransaction],
    ['Expense', prisma.expense],
    ['GrindingService', prisma.grindingService],
    ['CashEntry', prisma.cashEntry],
    ['CashWithdrawal', prisma.cashWithdrawal],
    ['CashTransfer', prisma.cashTransfer],
    ['CashSession', prisma.cashSession],
    ['DailyBalance', prisma.dailyBalance],
    ['ProductoCarga', prisma.productoCarga],
    ['PrintJob', prisma.printJob],
  ];

  console.log('=== Movimiento ===');
  for (const [nombre, modelo] of pasos) {
    if (dryRun) {
      console.log(`  [dry-run] ${nombre.padEnd(28)} ${await modelo.count()} registro(s)`);
      continue;
    }
    const { count } = await modelo.deleteMany({});
    console.log(`  ${nombre.padEnd(28)} ${count} borrado(s)`);
  }

  console.log('\n=== Productos fuera del catálogo ===');
  const productos = await prisma.producto.findMany({ orderBy: { nombre: 'asc' } });
  let fuera = 0;

  for (const producto of productos) {
    if (CATALOGO.includes(producto.nombre.toLowerCase())) continue;
    fuera += 1;

    // En seco las compras siguen ahí, así que se informa en vez de fingir que se borraría.
    if (dryRun) {
      const compras = await prisma.purchase.count({ where: { productoId: producto.id } });
      console.log(`  [dry-run] "${producto.nombre}" (${compras} compra(s) que se borran antes)`);
      continue;
    }

    await prisma.producto.delete({ where: { id: producto.id } });
    console.log(`  "${producto.nombre}" borrado`);
  }

  if (fuera === 0) console.log('  Ninguno: el catálogo está limpio.');

  console.log(
    dryRun
      ? '\nNada se escribió (--dry-run).'
      : '\nListo. Correr `pnpm seed-coffee-types` si falta algún tipo del catálogo.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
