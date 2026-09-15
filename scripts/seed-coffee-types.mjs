/**
 * Sincroniza la tabla `Producto` con el catálogo cerrado de tipos de café.
 *
 * El catálogo vive en `lib/coffee-types.ts` y es la fuente de verdad, pero las
 * compras, ventas y cargas apuntan a `Producto` por id: el histórico no se puede
 * reescribir, así que las filas tienen que existir. Este script las crea si
 * faltan y corrige la categoría de las que ya están.
 *
 * Es idempotente: se puede correr después de cada despliegue.
 *
 *   node scripts/seed-coffee-types.mjs
 *       Crea los tipos que falten y alinea las categorías.
 *
 *   node scripts/seed-coffee-types.mjs --dry-run
 *       Muestra lo que haría sin escribir nada.
 *
 * Los productos que no estén en el catálogo —nombres del histórico, o cosas que
 * no son café— se listan al final y **no se tocan**: borrarlos rompería las
 * compras que los referencian, y decidir qué hacer con ellos es del negocio.
 *
 * La lista se duplica aquí porque Node no puede importar TypeScript directamente,
 * igual que pasa con el formato del hash en `create-admin.mjs`. Si cambia
 * `lib/coffee-types.ts`, hay que cambiarla aquí.
 */
import { PrismaClient } from '@prisma/client';

const COFFEE_TYPES = [
  { nombre: 'Pergamino húmedo', categoria: 'pergamino' },
  { nombre: 'Pergamino mojado', categoria: 'pergamino' },
  { nombre: 'Pergamino seco', categoria: 'pergamino' },
  { nombre: 'Uva', categoria: 'uva' },
  { nombre: 'Requema', categoria: 'otros' },
  { nombre: 'Verde', categoria: 'otros' },
  { nombre: 'Guacuco', categoria: 'otros' },
  { nombre: 'Repaso', categoria: 'otros' },
];

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  const existentes = await prisma.producto.findMany();
  const porNombre = new Map(existentes.map((producto) => [producto.nombre.toLowerCase(), producto]));

  let creados = 0;
  let actualizados = 0;

  for (const tipo of COFFEE_TYPES) {
    const actual = porNombre.get(tipo.nombre.toLowerCase());

    if (!actual) {
      console.log(`${dryRun ? '[dry-run] ' : ''}crear   ${tipo.nombre} (${tipo.categoria})`);
      if (!dryRun) {
        await prisma.producto.create({ data: { nombre: tipo.nombre, categoria: tipo.categoria } });
      }
      creados += 1;
      continue;
    }

    if (actual.categoria !== tipo.categoria) {
      console.log(`${dryRun ? '[dry-run] ' : ''}ajustar ${tipo.nombre}: ${actual.categoria ?? 'sin categoría'} -> ${tipo.categoria}`);
      if (!dryRun) {
        await prisma.producto.update({ where: { id: actual.id }, data: { categoria: tipo.categoria } });
      }
      actualizados += 1;
    }
  }

  const delCatalogo = new Set(COFFEE_TYPES.map((tipo) => tipo.nombre.toLowerCase()));
  const fuera = existentes.filter((producto) => !delCatalogo.has(producto.nombre.toLowerCase()));

  console.log(`\n${creados} creados, ${actualizados} actualizados.`);

  if (fuera.length > 0) {
    console.log(`\n${fuera.length} producto(s) fuera del catálogo, sin tocar:`);
    for (const producto of fuera) {
      const compras = await prisma.purchase.count({ where: { productoId: producto.id } });
      const ventas = await prisma.sale.count({ where: { productoId: producto.id } });
      console.log(`  ${producto.nombre} — ${compras} compra(s), ${ventas} venta(s)`);
    }
    console.log('\nSi alguno no tiene movimientos, se puede borrar desde Inventario.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
