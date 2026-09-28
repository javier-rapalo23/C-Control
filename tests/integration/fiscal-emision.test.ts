import { prisma } from '@/lib/prisma';
import { buildInvoiceForOrigen } from '@/lib/build-invoice';
import {
  CaiNoDisponibleError,
  DocumentoEmitidoError,
  anularDocumentoFiscal,
  assertSinDocumentoFiscal,
  emitirDocumentoFiscal,
} from '@/lib/fiscal-document';

/**
 * Criterios de aceptación de la emisión (§9 de `docs/facturacion-sar-plan.md`). Todos
 * necesitan Postgres de verdad: el bloqueo de fila que asigna el correlativo no se
 * puede simular con un doble de Prisma.
 *
 * Se salta sin `.env.test`.
 */

const conBase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SUFIJO = `emision-${Date.now()}`;
const HOY = new Date();

/**
 * `numeroCompleto` es único en toda la base —es la red que impide imprimir dos veces
 * el mismo número—, así que los códigos de la prueba se sortean por corrida: con
 * códigos fijos, una segunda corrida chocaría con los documentos de la primera.
 */
const ESTABLECIMIENTO = String(Math.floor(Math.random() * 900) + 100);
const PUNTO_EMISION = String(Math.floor(Math.random() * 900) + 100);

/**
 * Cada CAI recibe su propio bloque de correlativos. El SAR no autoriza rangos
 * solapados para el mismo punto de emisión, así que reusar el rango 1–500 en cada
 * CAI de la prueba era un escenario que no puede existir.
 */
let siguienteBloque = 1;
function reservarBloque(tamano = 1_000) {
  const desde = siguienteBloque;
  siguienteBloque += tamano;
  return { rangoDesde: desde, rangoHasta: desde + tamano - 1, ultimoCorrelativo: desde - 1 };
}

/** Prefijos con los que la suite marca todo lo que crea, para poder barrerlo. */
const PREFIJO_CAI = 'CAI-emision-';
const PREFIJO_BODEGA = 'Bodega emision-';
const PREFIJO_CLIENTE = 'Cliente emision-';
const PREFIJO_PRODUCTO = 'Café emision-';

/**
 * Borra los rastros de esta suite, incluidos los de corridas anteriores que hayan
 * fallado a medias. Se llama **antes y después**: una prueba que no se puede volver a
 * correr tras un fallo es una trampa, y acá el `RESTRICT` de los documentos hace que
 * un rastro viejo tumbe la corrida siguiente.
 *
 * El orden importa: primero los documentos, que son los que bloquean el borrado de
 * las transacciones y de los CAI.
 */
async function limpiarRastros() {
  const cais = await prisma.fiscalCai.findMany({
    where: { codigo: { startsWith: PREFIJO_CAI } },
    select: { id: true },
  });
  const caiIds = cais.map((cai) => cai.id);

  if (caiIds.length > 0) {
    await prisma.fiscalAuditLog.deleteMany({ where: { caiId: { in: caiIds } } });
    // Transacción **interactiva** y no `$transaction([...])`: en la forma de lote,
    // Prisma no garantiza el orden de las consultas y el borrado del CAI llegaba
    // antes que el de sus documentos, contra el `RESTRICT`.
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.deleteMany({ where: { cai: { codigo: { startsWith: PREFIJO_CAI } } } });
      await tx.fiscalCai.deleteMany({ where: { codigo: { startsWith: PREFIJO_CAI } } });
    });
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { nombre: { startsWith: PREFIJO_BODEGA } },
    select: { id: true },
  });
  const sucursalIds = sucursales.map((sucursal) => sucursal.id);

  if (sucursalIds.length > 0) {
    const where = { sucursalId: { in: sucursalIds } };
    await prisma.sale.deleteMany({ where });
    await prisma.saleTransaction.deleteMany({ where });
    await prisma.purchase.deleteMany({ where });
    await prisma.purchaseTransaction.deleteMany({ where });
    await prisma.grindingService.deleteMany({ where });
    await prisma.dailyBalance.deleteMany({ where });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
  }

  await prisma.producto.deleteMany({ where: { nombre: { startsWith: PREFIJO_PRODUCTO } } });
  await prisma.client.deleteMany({ where: { nombre: { startsWith: PREFIJO_CLIENTE } } });
}

conBase('emisión de documentos fiscales', () => {
  let sucursalId = '';
  let clientId = '';
  let productoId = '';
  const caisCreados: string[] = [];

  beforeAll(async () => {
    await limpiarRastros();

    const sucursal = await prisma.sucursal.create({ data: { nombre: `Bodega ${SUFIJO}` } });
    const cliente = await prisma.client.create({ data: { nombre: `Cliente ${SUFIJO}` } });
    const producto = await prisma.producto.create({
      data: { nombre: `Café ${SUFIJO}`, categoria: 'pergamino', clasificacionFiscal: 'EXENTO' },
    });
    sucursalId = sucursal.id;
    clientId = cliente.id;
    productoId = producto.id;
  });

  afterAll(async () => {
    await limpiarRastros();
    await prisma.$disconnect();
  });

  /** Un CAI activo para el tipo pedido, desactivando el que hubiera. */
  async function crearCaiActivo(overrides: Record<string, unknown> = {}, tipoDocumento = 'factura') {
    await prisma.fiscalCai.updateMany({ where: { tipoDocumento, estado: 'activo' }, data: { estado: 'inactivo' } });
    const cai = await prisma.fiscalCai.create({
      data: {
        tipoDocumento,
        codigo: `CAI-${SUFIJO}-${Math.random().toString(36).slice(2, 8)}`,
        codigoEstablecimiento: ESTABLECIMIENTO,
        codigoPuntoEmision: PUNTO_EMISION,
        codigoTipoDocumento: tipoDocumento === 'factura' ? '01' : '04',
        ...reservarBloque(),
        fechaLimite: new Date('2027-12-31T00:00:00.000Z'),
        modo: 'SISTEMA',
        estado: 'activo',
        ...overrides,
      },
    });
    caisCreados.push(cai.id);
    return cai;
  }

  async function crearVenta(total = 1_000) {
    return prisma.saleTransaction.create({
      data: { businessDate: HOY, sucursalId, clientId, total },
    });
  }

  async function crearCompra(total = 2_000) {
    return prisma.purchaseTransaction.create({
      data: {
        businessDate: HOY,
        sucursalId,
        clientId,
        total,
        items: {
          create: [
            {
              businessDate: HOY,
              sucursalId,
              productoId,
              productoNombre: `Café ${SUFIJO}`,
              precioPorLibra: 20,
              libras: 100,
              total,
            },
          ],
        },
      },
    });
  }

  // Criterio 9.1. Van 100 emisiones con hasta 10 en vuelo a la vez: el límite lo pone
  // el pool de conexiones de Prisma, no la prueba. Aun así compiten por el mismo
  // bloqueo de fila, que es lo que se quiere verificar.
  it('100 emisiones sobre el mismo CAI no repiten ni saltan números', async () => {
    const cai = await crearCaiActivo();
    const ventas = await Promise.all(Array.from({ length: 100 }, () => crearVenta()));

    const enVuelo = 10;
    const numeros: number[] = [];
    for (let i = 0; i < ventas.length; i += enVuelo) {
      const lote = ventas.slice(i, i + enVuelo);
      const documentos = await Promise.all(
        lote.map((venta) =>
          emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' }),
        ),
      );
      numeros.push(...documentos.map((doc) => doc.correlativo));
    }

    const ordenados = [...numeros].sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(100);
    expect(ordenados[0]).toBe(cai.rangoDesde);
    expect(ordenados[99]).toBe(cai.rangoDesde + 99);
    // Sin saltos: cada número es el anterior más uno.
    for (let i = 1; i < ordenados.length; i += 1) {
      expect(ordenados[i]).toBe(ordenados[i - 1] + 1);
    }

    const recargado = await prisma.fiscalCai.findUniqueOrThrow({ where: { id: cai.id } });
    expect(recargado.ultimoCorrelativo).toBe(cai.rangoDesde + 99);
  }, 120_000);

  // Criterio 9.2: es la razón de no usar una secuencia de Postgres.
  it('una emisión que falla no consume número', async () => {
    const cai = await crearCaiActivo();
    const venta = await crearVenta();

    const primero = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: venta.id,
      usuario: 'tester',
    });
    expect(primero.correlativo).toBe(cai.rangoDesde);

    // Falla porque la transacción no existe: el rollback devuelve el contador.
    await expect(
      emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: 'no-existe', usuario: 'tester' }),
    ).rejects.toThrow();

    const siguiente = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: (await crearVenta()).id,
      usuario: 'tester',
    });

    expect(siguiente.correlativo).toBe(cai.rangoDesde + 1);
    const recargado = await prisma.fiscalCai.findUniqueOrThrow({ where: { id: cai.id } });
    expect(recargado.ultimoCorrelativo).toBe(cai.rangoDesde + 1);
  });

  // Criterio 9.3.
  it('no emite con el CAI vencido, agotado o inactivo', async () => {
    const venta = await crearVenta();

    await crearCaiActivo({ fechaLimite: new Date('2020-01-01T00:00:00.000Z') });
    await expect(
      emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' }),
    ).rejects.toThrow(CaiNoDisponibleError);

    const agotado = await crearCaiActivo();
    await prisma.fiscalCai.update({
      where: { id: agotado.id },
      data: { ultimoCorrelativo: agotado.rangoHasta },
    });
    await expect(
      emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' }),
    ).rejects.toThrow(CaiNoDisponibleError);

    // Sin CAI activo del tipo tampoco: el mensaje manda a Mantenimiento.
    await prisma.fiscalCai.updateMany({ where: { tipoDocumento: 'factura' }, data: { estado: 'inactivo' } });
    await expect(
      emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' }),
    ).rejects.toThrow(CaiNoDisponibleError);
  });

  // Criterio 9.4: acá se comprueba el aviso legible; el RESTRICT de la base está en
  // `fiscal-constraints.test.ts`.
  it('una transacción documentada queda bloqueada para borrado', async () => {
    await crearCaiActivo();
    const venta = await crearVenta();
    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: venta.id,
      usuario: 'tester',
    });

    await expect(assertSinDocumentoFiscal(prisma, 'venta', venta.id)).rejects.toThrow(DocumentoEmitidoError);
    await expect(assertSinDocumentoFiscal(prisma, 'venta', venta.id)).rejects.toThrow(documento.numeroCompleto);
  });

  // Criterio 9.5: la mitad que se puede comprobar sin la impresión (Fase 3).
  it('el snapshot no cambia cuando cambian los datos de la empresa', async () => {
    await crearCaiActivo({ tipoDocumento: 'boleta_compra', codigoTipoDocumento: '04' }, 'boleta_compra');
    const compra = await crearCompra();
    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'compra',
      transactionId: compra.id,
      usuario: 'tester',
    });

    const empresaOriginal = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });

    await prisma.companySettings.update({
      where: { id: 'singleton' },
      data: { nombre: `Otro nombre ${SUFIJO}` },
    });

    const guardado = await prisma.fiscalDocument.findUniqueOrThrow({ where: { id: documento.id } });
    const snapshot = guardado.snapshot as { empresa: { nombre: string }; numeroFiscal: string };

    expect(snapshot.empresa.nombre).toBe(empresaOriginal.nombre);
    expect(snapshot.numeroFiscal).toBe(documento.numeroCompleto);

    await prisma.companySettings.update({
      where: { id: 'singleton' },
      data: { nombre: empresaOriginal.nombre },
    });
  });

  // Criterio 9.5 completo: lo que se imprime sale del snapshot, no de los datos vivos.
  it('reimprimir después de cambiar la empresa muestra los datos originales', async () => {
    await crearCaiActivo({ tipoDocumento: 'boleta_compra', codigoTipoDocumento: '04' }, 'boleta_compra');
    const compra = await crearCompra();
    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'compra',
      transactionId: compra.id,
      usuario: 'tester',
    });

    const empresaOriginal = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    await prisma.companySettings.update({
      where: { id: 'singleton' },
      data: { nombre: `Nombre nuevo ${SUFIJO}` },
    });

    // La misma llamada que hace la página `/print/compra/:id`.
    const impreso = await buildInvoiceForOrigen('compra', compra.id);

    expect(impreso?.empresa.nombre).toBe(empresaOriginal.nombre);
    expect(impreso?.documento?.numeroCompleto).toBe(documento.numeroCompleto);
    expect(impreso?.documento?.estado).toBe('emitido');
    // El bloque fiscal sale del CAI con el que se emitió.
    expect(impreso?.documento?.cai.codigo).toBeTruthy();

    // Anulado, la hoja lo tiene que decir sin volver a emitir nada.
    await anularDocumentoFiscal(prisma, {
      id: documento.id,
      usuario: 'admin',
      motivo: 'Prueba de reimpresión',
    });
    const anulado = await buildInvoiceForOrigen('compra', compra.id);
    expect(anulado?.documento?.estado).toBe('anulado');
    expect(anulado?.documento?.anulacionMotivo).toBe('Prueba de reimpresión');

    await prisma.companySettings.update({
      where: { id: 'singleton' },
      data: { nombre: empresaOriginal.nombre },
    });
  });

  it('el desglose del molido deja el ISV dentro del monto cobrado', async () => {
    await crearCaiActivo();
    const servicio = await prisma.grindingService.create({
      data: { businessDate: HOY, sucursalId, clientId, libras: 50, monto: 100, registradoPor: 'tester' },
    });

    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'molido',
      transactionId: servicio.id,
      usuario: 'tester',
    });

    expect(documento.total).toBe(100);
    expect(documento.desglose.importeGravado15).toBe(86.96);
    expect(documento.desglose.isv15).toBe(13.04);
  });

  it('anular conserva el número, exige motivo y no se repite', async () => {
    await crearCaiActivo();
    const venta = await crearVenta();
    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: venta.id,
      usuario: 'tester',
    });

    const anulado = await anularDocumentoFiscal(prisma, {
      id: documento.id,
      usuario: 'admin',
      motivo: 'Se imprimió con el cliente equivocado',
      copiaFisicaResguardada: true,
      copiaFisicaUbicacion: 'Folder de anulados 2026',
    });

    expect(anulado?.estado).toBe('anulado');
    // El número sigue siendo el mismo: el rango no puede tener huecos.
    expect(anulado?.numeroCompleto).toBe(documento.numeroCompleto);
    expect(anulado?.copiaFisicaUbicacion).toBe('Folder de anulados 2026');

    await expect(
      anularDocumentoFiscal(prisma, { id: documento.id, usuario: 'admin', motivo: 'otra vez' }),
    ).rejects.toThrow('ya está anulado');

    const bitacora = await prisma.fiscalAuditLog.findMany({ where: { fiscalDocumentId: documento.id } });
    expect(bitacora.map((entrada) => entrada.accion).sort()).toEqual(['anulacion', 'emision']);
  });

  it('en modo talonario exige el número del papel y lo valida contra el rango', async () => {
    const cai = await crearCaiActivo({ modo: 'TALONARIO' });
    const venta = await crearVenta();

    await expect(
      emitirDocumentoFiscal(prisma, { origen: 'venta', transactionId: venta.id, usuario: 'tester' }),
    ).rejects.toThrow('modo talonario');

    await expect(
      emitirDocumentoFiscal(prisma, {
        origen: 'venta',
        transactionId: venta.id,
        usuario: 'tester',
        // Un número de otro bloque: fuera del rango de este CAI.
        numeroManual: cai.rangoDesde - 1,
      }),
    ).rejects.toThrow('fuera del rango');

    const aMano = cai.rangoDesde + 4;
    const documento = await emitirDocumentoFiscal(prisma, {
      origen: 'venta',
      transactionId: venta.id,
      usuario: 'tester',
      numeroManual: aMano,
    });
    expect(documento.numeroCompleto).toBe(
      `${ESTABLECIMIENTO}-${PUNTO_EMISION}-01-${String(aMano).padStart(8, '0')}`,
    );

    // Un número ya usado no se puede repetir, aunque se escriba a mano.
    const otraVenta = await crearVenta();
    await expect(
      emitirDocumentoFiscal(prisma, {
        origen: 'venta',
        transactionId: otraVenta.id,
        usuario: 'tester',
        numeroManual: aMano,
      }),
    ).rejects.toThrow();
  });
});
