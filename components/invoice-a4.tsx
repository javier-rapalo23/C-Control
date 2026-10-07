import { RENGLONES_DESGLOSE } from '@/lib/fiscal';
import type { InvoiceData, InvoiceLinea } from '@/lib/build-invoice';
import type { PrintFormat } from '@/lib/print-formats';

/**
 * Factura en A4 o en papel continuo, para el diálogo de impresión del navegador.
 *
 * Se maqueta HTML y se deja que el navegador lo mande a la impresora que el usuario
 * ya tiene configurada en el sistema operativo: no hace falta agente ni IP.
 *
 * El CSS de impresión oculta *todo* el documento y vuelve a mostrar solo las hojas,
 * en vez de enumerar las clases del encabezado y el menú de la aplicación: así un
 * cambio en la navegación no reaparece dentro de la factura.
 *
 * En A4 se imprimen **dos copias** en un solo trabajo: la del cliente y la del
 * control interno. Son el mismo documento con distinto rótulo, y van en hojas
 * separadas para que las dos queden a tamaño completo y con su espacio de firmas.
 *
 * En papel continuo va **una sola hoja**: el papel es de copias y la impresora saca
 * original y copia de una pasada. Mandar dos hojas gastaría el doble de formulario y
 * dejaría dos juegos. Ver `lib/print-formats.ts`.
 */

const CSS = `
@page { size: A4; margin: 14mm; }

.invoice-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  max-width: 190mm;
  margin: 16px auto 0;
  padding: 0 6mm;
}

.invoice-sheet {
  background: #fff;
  color: #111;
  max-width: 190mm;
  margin: 16px auto 40px;
  padding: 10mm;
  font-family: var(--font-jakarta), system-ui, sans-serif;
  font-size: 10.5pt;
  /* Seminegrita de base: con el peso normal los datos sin negrita salían tenues en
     papel, sobre todo en impresoras láser en modo ahorro y en matriciales. */
  font-weight: 600;
  line-height: 1.35;
  box-shadow: 0 1px 14px rgba(0, 0, 0, 0.16);
}

.invoice-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.invoice-empresa-nombre { font-size: 15pt; font-weight: 800; margin: 0 0 2px; }
.invoice-empresa-dato { margin: 0; font-size: 9pt; color: #222; }

/* Rótulo de la copia. Es lo primero que se busca al tener las dos hojas en la
   mano, así que va arriba del título y con recuadro. */
.invoice-copia {
  display: inline-block;
  border: 1.5px solid #111;
  border-radius: 3px;
  padding: 2px 7px;
  margin-bottom: 6px;
  font-size: 8pt;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.invoice-copia-interno { background: #111; color: #fff; }

.invoice-meta { text-align: right; min-width: 52mm; margin: 0; }
.invoice-titulo { font-size: 12pt; font-weight: 800; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.4px; }
.invoice-meta-fila { display: flex; justify-content: space-between; gap: 10px; font-size: 9.5pt; }
.invoice-meta-fila dt { color: #222; margin: 0; }
.invoice-meta-fila dd { margin: 0; font-weight: 700; }
.invoice-folio dd { font-size: 12pt; }

.invoice-fiscal {
  margin-top: 8px;
  border: 1px solid #bbb;
  padding: 5px 8px;
  font-size: 8.5pt;
  color: #222;
}
.invoice-fiscal p { margin: 0; }

/* Aviso de que la hoja no es un documento fiscal. Sobrio pero visible: es lo que
   distingue un comprobante interno de una factura. */
.invoice-interno { border-style: dashed; font-weight: 700; text-align: center; }

/* Referencia de una nota al documento que corrige. Va arriba, junto al bloque fiscal:
   los dos papeles se archivan juntos y es el dato que los empareja. */
.invoice-referencia { margin-top: 6px; }

/* Bloque del adquiriente exonerado. Enmarcado porque es un bloque que se revisa como
   unidad: o están los cuatro datos o la exoneración no se puede sustentar. */
.invoice-exonerado {
  margin-top: 8px;
  border: 1px solid #111;
  padding: 5px 8px;
}
.invoice-exonerado-titulo {
  margin: 0 0 3px;
  font-size: 8.5pt;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
/* Una sola columna y del ancho de su contenido: son tres datos cortos y el recuadro a
   todo el ancho le quitaba espacio a las líneas. */
.invoice-exonerado { width: fit-content; max-width: 100%; }
.invoice-exonerado .invoice-cliente {
  margin-top: 0;
  border: none;
  padding: 0;
  grid-template-columns: 1fr;
  gap: 1px;
}
.invoice-exonerado .invoice-campo { font-size: 8.5pt; }
.invoice-exonerado .invoice-campo span:first-child { min-width: 62mm; }
/* Dato que falta: raya para llenarlo a mano, como en un formulario preimpreso. */
.invoice-campo-vacio { display: inline-block; min-width: 40mm; border-bottom: 1px solid #111; }

/* Un documento anulado tiene que leerse como anulado de un vistazo, aunque alguien
   solo mire la hoja de lejos. */
.invoice-anulado {
  margin: 10px 0 0;
  border: 2px solid #111;
  padding: 6px 10px;
  text-align: center;
  font-size: 13pt;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Desglose de totales del documento fiscal. Alineado a la derecha, como el total. */
.invoice-desglose { margin-top: 12px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 9.5pt; }
.invoice-desglose-fila { display: flex; gap: 16px; }
.invoice-desglose-label { color: #222; min-width: 48mm; text-align: right; }
.invoice-desglose-monto { min-width: 90px; text-align: right; font-variant-numeric: tabular-nums; }

.invoice-cliente {
  margin-top: 12px;
  border-top: 1.5px solid #111;
  border-bottom: 1px solid #ccc;
  padding: 8px 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 20px;
}
.invoice-campo { display: flex; gap: 6px; font-size: 9.5pt; }
.invoice-campo span:first-child { color: #222; min-width: 28mm; }
.invoice-campo span:last-child { font-weight: 700; }

table.invoice-lineas { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 9.5pt; }
table.invoice-lineas th {
  text-align: right;
  border-bottom: 1.5px solid #111;
  padding: 5px 4px;
  font-size: 8.5pt;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #222;
  white-space: nowrap;
}
table.invoice-lineas td { text-align: right; padding: 5px 4px; border-bottom: 1px solid #e2e2e2; }
table.invoice-lineas th:first-child, table.invoice-lineas td:first-child { text-align: left; }
table.invoice-lineas tfoot td { border-bottom: none; border-top: 1.5px solid #111; font-weight: 800; padding-top: 7px; }
.invoice-linea-desc { color: #222; font-size: 8.5pt; }

.invoice-total {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  align-items: baseline;
}
.invoice-total-label { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.4px; }
.invoice-total strong { font-size: 15pt; }

/* Ajustes al pie (bono y descuento). Alineados con el total para que se lean
   como la cuenta que llevan al total, no como notas sueltas. */
.invoice-ajustes { margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-size: 9.5pt; }
.invoice-ajuste { display: flex; gap: 16px; align-items: baseline; }
.invoice-ajuste-label { color: #222; }
.invoice-ajuste-monto { min-width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
.invoice-ajuste-motivo { font-size: 8.5pt; color: #222; font-style: italic; }

.invoice-pie { margin-top: 10px; font-size: 9.5pt; }

/* Aviso de la vista previa. Solo existe en pantalla: la hoja de verdad se imprime
   desde /print, nunca desde la vista previa. */
.invoice-vista-previa {
  margin: 0 0 10px;
  padding: 6px 10px;
  border: 1.5px dashed #b45309;
  background: #fffbeb;
  color: #78350f;
  font-size: 9pt;
  font-weight: 700;
  text-align: center;
}

.invoice-firmas { margin-top: 26mm; display: flex; justify-content: space-between; gap: 30px; }
.invoice-firma { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 9pt; color: #222; }

@media print {
  /* Se oculta todo y se vuelve a mostrar solo el camino hasta las hojas, en vez de
     enumerar las clases del encabezado y el menú: así un cambio en la navegación no
     reaparece dentro de una factura ya impresa.
     Se usa display:none y no visibility:hidden porque lo oculto no debe reservar
     espacio, y así las hojas se quedan en el flujo normal: sacándolas con position
     absolute, el salto de página entre copias deja de ser confiable. */
  body > *,
  .app-shell > *,
  .app-main > * { display: none !important; }
  body > .app-shell,
  .app-shell > .app-main,
  .app-main > .invoice-copias { display: block !important; }
  .invoice-sheet {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  /* Cada copia en su propia hoja. */
  .invoice-sheet + .invoice-sheet { break-before: page; }
  /* Una compra larga puede pasar de página; el encabezado de la tabla se repite. */
  table.invoice-lineas thead { display: table-header-group; }
  table.invoice-lineas tr { break-inside: avoid; }
  .invoice-firmas { break-inside: avoid; }
}
`;

/**
 * Ajustes del papel continuo: carta continua de 9.5" × 11". Va después del CSS base, así
 * que su `@page` es el que manda.
 *
 * Los márgenes laterales dejan libres las tiras perforadas del arrastre. En impresión
 * todo va en negro: una matricial imprime los grises como un punteado que se lee peor,
 * y en la copia de carbón se pierden.
 */
const CSS_CONTINUO = `
@page { size: 9.5in 11in; margin: 0.35in 0.6in; }

.invoice-copias-continuo .invoice-sheet { max-width: 8.3in; }

@media print {
  .invoice-copias-continuo .invoice-sheet,
  .invoice-copias-continuo .invoice-sheet * { color: #000 !important; border-color: #000 !important; }
}
`;

const lempiras = (valor: number) =>
  `L ${valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const numero = (valor: number) =>
  valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fechaLarga(businessDate: string) {
  const [year, month, day] = businessDate.split('-');
  return `${day}/${month}/${year}`;
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="invoice-campo">
      <span>{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
}

/** Como `Campo`, pero se imprime aunque no haya valor: deja la raya para llenarlo. */
function CampoFormulario({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="invoice-campo">
      <span>{etiqueta}</span>
      {valor ? <span>{valor}</span> : <span className="invoice-campo-vacio" />}
    </div>
  );
}

/**
 * La compra **no imprime el conteo de sacos ni el rendimiento**: la tara ya explica
 * lo que se descuenta del bruto, y el rendimiento es una estimación del beneficio
 * que no forma parte de lo que se le liquida al productor. Los dos datos se siguen
 * capturando y guardando; lo que cambió es el papel.
 *
 * Los quintales oro sí salen: es la cifra con la que el productor compara.
 */
function FilaCompra({ linea }: { linea: InvoiceLinea }) {
  const taraTotal =
    linea.taraPorSaco !== null && linea.numeroSacos !== null ? linea.taraPorSaco * linea.numeroSacos : null;

  return (
    <tr>
      <td>{linea.productoNombre}</td>
      <td>{linea.pesoBruto !== null ? numero(linea.pesoBruto) : '—'}</td>
      <td>{taraTotal !== null ? numero(taraTotal) : '—'}</td>
      <td>{numero(linea.libras)}</td>
      <td>{linea.quintalesOro !== null ? numero(linea.quintalesOro) : '—'}</td>
      <td>{linea.precioPorLibra !== null ? lempiras(linea.precioPorLibra) : '—'}</td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

/**
 * La venta tampoco imprime sacos, factor ni quintales oro: la tara ya explica lo que se
 * descuenta del bruto, y el rendimiento es un dato interno. Se siguen capturando y
 * guardando; solo dejan de salir en el papel.
 */
function FilaVenta({ linea }: { linea: InvoiceLinea }) {
  // En modo oro el precio es por quintal oro y no por libra: se rotula distinto
  // para que nadie lea un precio por quintal como si fuera por libra.
  const precio =
    linea.precioPorQuintalOro !== null
      ? `${lempiras(linea.precioPorQuintalOro)} / qq oro`
      : linea.precioPorLibra !== null
        ? `${lempiras(linea.precioPorLibra)} / lb`
        : '—';

  // Las ventas anteriores al pesaje solo guardaron el neto: esas columnas salen
  // con guion en vez de inventar un bruto.
  const taraTotal =
    linea.taraPorSaco !== null && linea.numeroSacos !== null ? linea.taraPorSaco * linea.numeroSacos : null;

  return (
    <tr>
      <td>
        {linea.productoNombre}
        {linea.descripcion ? <div className="invoice-linea-desc">{linea.descripcion}</div> : null}
      </td>
      <td>{linea.pesoBruto !== null ? numero(linea.pesoBruto) : '—'}</td>
      <td>{taraTotal !== null ? numero(taraTotal) : '—'}</td>
      <td>{linea.libras > 0 ? numero(linea.libras) : '—'}</td>
      <td>{precio}</td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

function FilaMolido({ linea }: { linea: InvoiceLinea }) {
  return (
    <tr>
      <td>
        {linea.productoNombre}
        {linea.descripcion ? <div className="invoice-linea-desc">{linea.descripcion}</div> : null}
      </td>
      <td>{numero(linea.libras)}</td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

/**
 * La única línea de una nota de crédito o débito: el motivo como concepto y el monto
 * del ajuste. No hay pesaje ni precio por libra porque lo que se corrige es dinero.
 */
function FilaNota({ linea }: { linea: InvoiceLinea }) {
  return (
    <tr>
      <td>
        {linea.productoNombre}
        {linea.descripcion ? <div className="invoice-linea-desc">{linea.descripcion}</div> : null}
      </td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

type Copia = { id: 'cliente' | 'interno' | 'continuo'; rotulo: string };

/** Las dos copias que se imprimen del mismo comprobante en A4. */
const COPIAS: readonly Copia[] = [
  { id: 'cliente', rotulo: 'Original — Cliente' },
  { id: 'interno', rotulo: 'Copia — Control interno' },
];

/** En papel continuo es una sola hoja, así que el rótulo dice para quién es cada copia. */
const COPIA_CONTINUO: Copia = { id: 'continuo', rotulo: 'Original: Cliente · Copia: Control interno' };

/** Cómo se rotula la fecha de la operación según lo que ampara el documento. */
function fechaOperacionLabel(kind: InvoiceData['kind']) {
  if (kind === 'compra') return 'Fecha de la compra';
  if (kind === 'molido') return 'Fecha del servicio';
  // Una nota se emite hoy y no ampara ninguna operación anterior: su fecha es una sola.
  if (kind === 'nota') return 'Fecha';
  return 'Fecha de la venta';
}

type HojaProps = {
  data: InvoiceData;
  copia: Copia;
  /** Compra todavía sin guardar: el número fiscal es el próximo, no uno asignado. */
  vistaPrevia?: boolean;
};

function Hoja({ data, copia, vistaPrevia = false }: HojaProps) {
  const esNota = data.kind === 'nota';
  // La nota hereda a quién se le dice productor: se emite sobre el documento de una
  // compra, y a quien se le compra café no se le llama cliente.
  const esCompra = data.kind === 'compra' || (esNota && data.notaSobre === 'compra');
  const esMolido = data.kind === 'molido';
  const documento = data.documento ?? null;
  const anulado = documento?.estado === 'anulado';
  const { empresa, cliente, lineas } = data;

  return (
      <article className="invoice-sheet">
        {vistaPrevia ? (
          <p className="invoice-vista-previa">
            Vista previa — todavía no se guardó.{' '}
            {documento
              ? 'El número es el próximo del CAI; si otra caja emite antes, sale con el siguiente.'
              : 'Esta compra no lleva documento fiscal al guardarse.'}
          </p>
        ) : null}
        <header className="invoice-top">
          <div>
            <p className="invoice-empresa-nombre">{empresa.nombre || 'Empresa sin nombre'}</p>
            {empresa.rtn ? <p className="invoice-empresa-dato">RTN {empresa.rtn}</p> : null}
            {empresa.direccion ? <p className="invoice-empresa-dato">{empresa.direccion}</p> : null}
            {empresa.telefono ? <p className="invoice-empresa-dato">Tel. {empresa.telefono}</p> : null}
            {empresa.email ? <p className="invoice-empresa-dato">{empresa.email}</p> : null}
          </div>

          <dl className="invoice-meta">
            <p className={`invoice-copia${copia.id === 'interno' ? ' invoice-copia-interno' : ''}`}>
              {copia.rotulo}
            </p>
            <p className="invoice-titulo">{documento ? documento.tipoDocumentoLabel : data.titulo}</p>

            {/* Con documento emitido, el número fiscal es el que identifica la hoja y
                va primero. El correlativo interno sigue saliendo, más discreto: es lo
                que casa las dos copias y lo que se busca dentro del sistema. */}
            {documento ? (
              <div className="invoice-meta-fila invoice-folio">
                <dt>{vistaPrevia ? 'Próximo No.' : 'No.'}</dt>
                <dd>{documento.numeroCompleto}</dd>
              </div>
            ) : (
              <div className="invoice-meta-fila invoice-folio">
                <dt>No.</dt>
                {/* Una compra sin guardar todavía no tiene correlativo interno. */}
                <dd>{data.numeroInterno || 'Se asigna al guardar'}</dd>
              </div>
            )}
            {documento && data.numeroInterno ? (
              <div className="invoice-meta-fila">
                <dt>Control interno</dt>
                <dd>{data.numeroInterno}</dd>
              </div>
            ) : null}
            {data.numeroFactura ? (
              <div className="invoice-meta-fila invoice-folio">
                <dt>Factura No.</dt>
                <dd>{data.numeroFactura}</dd>
              </div>
            ) : null}

            {/* Las dos fechas, porque no siempre coinciden: el papel se hace días
                después del pesaje y no hay que hacerlo pasar por emitido ese día. */}
            {documento ? (
              <div className="invoice-meta-fila">
                <dt>Fecha de emisión</dt>
                <dd>{fechaLarga(documento.fechaEmision)}</dd>
              </div>
            ) : null}
            <div className="invoice-meta-fila">
              <dt>{documento ? fechaOperacionLabel(data.kind) : 'Fecha'}</dt>
              <dd>{fechaLarga(data.businessDate)}</dd>
            </div>
            <div className="invoice-meta-fila">
              <dt>Sucursal</dt>
              <dd>{data.sucursalNombre}</dd>
            </div>
          </dl>
        </header>

        {/* Sin documento emitido la hoja no puede pasar por fiscal, y decirlo en el
            papel evita que alguien la archive como si lo fuera. */}
        {!documento ? (
          <section className="invoice-fiscal invoice-interno">
            <p>Comprobante interno — no es documento fiscal</p>
          </section>
        ) : null}

        {documento ? (
          <section className="invoice-fiscal">
            <p>CAI: {documento.cai.codigo}</p>
            {documento.cai.rangoDesde && documento.cai.rangoHasta ? (
              <p>
                Rango autorizado: {String(documento.cai.rangoDesde).padStart(8, '0')} a{' '}
                {String(documento.cai.rangoHasta).padStart(8, '0')}
              </p>
            ) : null}
            {documento.cai.fechaLimite ? (
              <p>Fecha límite de emisión: {fechaLarga(documento.cai.fechaLimite)}</p>
            ) : null}
          </section>
        ) : null}
        {/* Los cuatro campos viejos de `CompanySettings` ya no se imprimen. Con ellos
            llenos, una hoja sin documento salía rotulada "no es documento fiscal" y
            con un CAI debajo: un código de autorización sobre un papel que no tiene
            correlativo autorizado. El CAI ahora lo trae el documento emitido. */}

        {/* Una nota sin decir a qué documento corresponde no le sirve ni al cliente ni a
            la contadora: es lo primero que se busca al emparejar los dos papeles. */}
        {documento?.documentoOrigen ? (
          <section className="invoice-fiscal invoice-referencia">
            <p>
              Modifica {documento.documentoOrigen.tipoDocumentoLabel} No.{' '}
              <strong>{documento.documentoOrigen.numeroCompleto}</strong>, emitida el{' '}
              {fechaLarga(documento.documentoOrigen.fechaEmision)}
            </p>
            {documento.notaMotivo ? <p>Motivo: {documento.notaMotivo}</p> : null}
          </section>
        ) : null}

        {anulado ? (
          <p className="invoice-anulado">
            Anulado{documento?.anulacionMotivo ? ` — ${documento.anulacionMotivo}` : ''}
          </p>
        ) : null}

        <section className="invoice-cliente">
          <Campo etiqueta={esCompra ? 'Productor' : 'Cliente'} valor={cliente.nombre} />
          <Campo etiqueta="Finca" valor={cliente.nombreFinca} />
          <Campo etiqueta="Clave IHCAFE" valor={cliente.claveIhcafe} />
          <Campo etiqueta="RTN" valor={cliente.rtn} />
          <Campo etiqueta="Teléfono" valor={cliente.telefono} />
          <Campo etiqueta="Dirección" valor={cliente.direccion} />
        </section>

        {/* Bloque del adquiriente exonerado. En la factura y la boleta de compra sale
            siempre, con raya donde falte un dato: son campos que el documento fiscal
            tiene que traer. En el comprobante interno y en las notas solo sale cuando
            hay algo que poner. */}
        {(documento && !esNota) ||
        cliente.registroExonerado ||
        cliente.registroSag ||
        documento?.ordenCompraExenta ? (
          <section className="invoice-exonerado">
            <p className="invoice-exonerado-titulo">Datos del adquiriente exonerado</p>
            <div className="invoice-cliente">
              <CampoFormulario etiqueta="No. orden de compra exenta" valor={documento?.ordenCompraExenta} />
              <CampoFormulario etiqueta="No. constancia de registro de exonerado" valor={cliente.registroExonerado} />
              <CampoFormulario etiqueta="No. registro de la SAG" valor={cliente.registroSag} />
            </div>
          </section>
        ) : null}

        <table className="invoice-lineas">
          <thead>
            {esNota ? (
              // Una nota corrige un monto: concepto y valor, nada más.
              <tr>
                <th>Concepto del ajuste</th>
                <th>Valor</th>
              </tr>
            ) : esMolido ? (
              // El molido no tiene pesaje ni rendimiento: es un servicio sobre café
              // que ni entra ni sale del inventario. Columnas de pesaje vacías solo
              // harían dudar de si falta un dato.
              <tr>
                <th>Concepto</th>
                <th>Libras molidas</th>
                <th>Valor</th>
              </tr>
            ) : esCompra ? (
              <tr>
                <th>Tipo de café</th>
                <th>Bruto (lb)</th>
                <th>Tara (lb)</th>
                <th>Neto (lb)</th>
                <th>QQ oro</th>
                <th>Precio / lb</th>
                <th>Valor</th>
              </tr>
            ) : (
              <tr>
                <th>Concepto</th>
                <th>Bruto (lb)</th>
                <th>Tara (lb)</th>
                <th>Neto (lb)</th>
                <th>Precio</th>
                <th>Valor</th>
              </tr>
            )}
          </thead>
          <tbody>
            {lineas.map((linea, indice) =>
              esNota ? (
                <FilaNota key={indice} linea={linea} />
              ) : esMolido ? (
                <FilaMolido key={indice} linea={linea} />
              ) : esCompra ? (
                <FilaCompra key={indice} linea={linea} />
              ) : (
                <FilaVenta key={indice} linea={linea} />
              ),
            )}
          </tbody>
          <tfoot>
            {esNota ? (
              <tr>
                <td>Total</td>
                <td>{lempiras(data.subtotal)}</td>
              </tr>
            ) : esMolido ? (
              <tr>
                <td>Totales</td>
                <td>{numero(data.totalLibras)}</td>
                <td>{lempiras(data.subtotal)}</td>
              </tr>
            ) : esCompra ? (
              <tr>
                <td>Totales</td>
                {/* Bruto y tara no se totalizan: lo que se paga es el neto. */}
                <td colSpan={2} />
                <td>{numero(data.totalLibras)}</td>
                <td>{data.totalQuintalesOro !== null ? numero(data.totalQuintalesOro) : '—'}</td>
                <td />
                {/* La columna suma las líneas, no lo que se paga: el bono y el
                    descuento van al pie, o esta fila no cuadraría con sus valores. */}
                <td>{lempiras(data.subtotal)}</td>
              </tr>
            ) : (
              <tr>
                <td>Totales</td>
                <td colSpan={2} />
                <td>{data.totalLibras > 0 ? numero(data.totalLibras) : '—'}</td>
                <td />
                <td>{lempiras(data.subtotal)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Sin ajustes, el pie queda igual que antes: solo el total. Con ellos se
            imprime de dónde sale, que es lo que el productor revisa. */}
        {data.bono > 0 || data.descuento > 0 ? (
          <div className="invoice-ajustes">
            <div className="invoice-ajuste">
              <span className="invoice-ajuste-label">Subtotal café</span>
              <span className="invoice-ajuste-monto">{lempiras(data.subtotal)}</span>
            </div>
            {data.bono > 0 ? (
              <div className="invoice-ajuste">
                <span className="invoice-ajuste-label">
                  Bono {data.bonoMotivo ? <span className="invoice-ajuste-motivo">({data.bonoMotivo})</span> : null}
                </span>
                <span className="invoice-ajuste-monto">+ {lempiras(data.bono)}</span>
              </div>
            ) : null}
            {data.descuento > 0 ? (
              <div className="invoice-ajuste">
                <span className="invoice-ajuste-label">
                  Descuento{' '}
                  {data.descuentoMotivo ? (
                    <span className="invoice-ajuste-motivo">({data.descuentoMotivo})</span>
                  ) : null}
                </span>
                <span className="invoice-ajuste-monto">− {lempiras(data.descuento)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Desglose fiscal, solo con documento emitido. **Los siete renglones salen
            siempre, incluso en cero** (requisito de la contadora del 29/09/2026): el
            formato del SAR los lleva preimpresos, y una factura sin el renglón del ISV no
            se lee como completa aunque el monto sea cero. La lista vive en `lib/fiscal.ts`. */}
        {documento ? (
          <div className="invoice-desglose">
            {RENGLONES_DESGLOSE.map((renglon) => (
              <div className="invoice-desglose-fila" key={renglon.key}>
                <span className="invoice-desglose-label">{renglon.label}</span>
                <span className="invoice-desglose-monto">{lempiras(documento.desglose[renglon.key])}</span>
              </div>
            ))}
            {/* El total no se repite acá: el de abajo va alineado en la misma columna y
                cierra el desglose. Impreso dos veces seguidas se leía como un error. */}
          </div>
        ) : null}

        <div className="invoice-total">
          <span className="invoice-total-label">{esCompra ? 'Total a pagar' : 'Total'}</span>
          <strong>{lempiras(data.total)}</strong>
        </div>

        {data.metodoPago ? <p className="invoice-pie">Forma de pago: {data.metodoPago}</p> : null}

        <div className="invoice-firmas">
          <div className="invoice-firma">Entregué conforme</div>
          <div className="invoice-firma">Recibí conforme</div>
        </div>
      </article>
  );
}

type InvoiceA4Props = {
  data: InvoiceData;
  /** Hoja A4 (dos hojas) o papel continuo (una sola, el papel saca la copia). */
  formato?: PrintFormat;
  vistaPrevia?: boolean;
};

/**
 * Con `vistaPrevia` sale una sola hoja también en A4: las dos copias son el mismo
 * documento, y lo que se revisa antes de guardar es el contenido, no el rótulo.
 */
export default function InvoiceA4({ data, formato = 'a4', vistaPrevia = false }: InvoiceA4Props) {
  const continuo = formato === 'continuo';
  const copias = continuo ? [COPIA_CONTINUO] : vistaPrevia ? COPIAS.slice(0, 1) : COPIAS;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: continuo ? CSS + CSS_CONTINUO : CSS }} />
      <div className={continuo ? 'invoice-copias invoice-copias-continuo' : 'invoice-copias'}>
        {copias.map((copia) => (
          <Hoja key={copia.id} data={data} copia={copia} vistaPrevia={vistaPrevia} />
        ))}
      </div>
    </>
  );
}
