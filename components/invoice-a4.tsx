import type { InvoiceData, InvoiceLinea } from '@/lib/build-invoice';

/**
 * Factura en A4, para el diálogo de impresión del navegador.
 *
 * La impresión térmica de `lib/thermal-printer.ts` encola un `PrintJob` que un
 * agente local manda por TCP a una ESC/POS. Ese camino no sirve para A4: una
 * láser o de inyección se imprime desde el sistema operativo, así que aquí se
 * maqueta HTML y se deja que el navegador lo mande a la impresora que el usuario
 * ya tiene configurada. No hace falta agente ni IP.
 *
 * El CSS de impresión oculta *todo* el documento y vuelve a mostrar solo la hoja,
 * en vez de enumerar las clases del encabezado y el menú de la aplicación: así un
 * cambio en la navegación no reaparece dentro de la factura.
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
  line-height: 1.35;
  box-shadow: 0 1px 14px rgba(0, 0, 0, 0.16);
}

.invoice-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.invoice-empresa-nombre { font-size: 15pt; font-weight: 700; margin: 0 0 2px; }
.invoice-empresa-dato { margin: 0; font-size: 9pt; color: #444; }

.invoice-meta { text-align: right; min-width: 52mm; margin: 0; }
.invoice-titulo { font-size: 12pt; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.4px; }
.invoice-meta-fila { display: flex; justify-content: space-between; gap: 10px; font-size: 9.5pt; }
.invoice-meta-fila dt { color: #444; margin: 0; }
.invoice-meta-fila dd { margin: 0; font-weight: 600; }
.invoice-folio dd { font-size: 12pt; }

.invoice-fiscal {
  margin-top: 8px;
  border: 1px solid #bbb;
  padding: 5px 8px;
  font-size: 8.5pt;
  color: #333;
}
.invoice-fiscal p { margin: 0; }

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
.invoice-campo span:first-child { color: #555; min-width: 28mm; }
.invoice-campo span:last-child { font-weight: 600; }

table.invoice-lineas { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 9.5pt; }
table.invoice-lineas th {
  text-align: right;
  border-bottom: 1.5px solid #111;
  padding: 5px 4px;
  font-size: 8.5pt;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #333;
  white-space: nowrap;
}
table.invoice-lineas td { text-align: right; padding: 5px 4px; border-bottom: 1px solid #e2e2e2; }
table.invoice-lineas th:first-child, table.invoice-lineas td:first-child { text-align: left; }
table.invoice-lineas tfoot td { border-bottom: none; border-top: 1.5px solid #111; font-weight: 700; padding-top: 7px; }
.invoice-linea-desc { color: #555; font-size: 8.5pt; }

.invoice-total {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  align-items: baseline;
}
.invoice-total-label { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.4px; }
.invoice-total strong { font-size: 15pt; }

.invoice-pie { margin-top: 10px; font-size: 9.5pt; }

.invoice-firmas { margin-top: 26mm; display: flex; justify-content: space-between; gap: 30px; }
.invoice-firma { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 9pt; color: #444; }

@media print {
  body * { visibility: hidden !important; }
  .invoice-sheet, .invoice-sheet * { visibility: visible !important; }
  .invoice-sheet {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .invoice-toolbar { display: none !important; }
  /* Una compra larga puede pasar de página; el encabezado de la tabla se repite. */
  table.invoice-lineas thead { display: table-header-group; }
  table.invoice-lineas tr { break-inside: avoid; }
  .invoice-firmas { break-inside: avoid; }
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

function FilaCompra({ linea }: { linea: InvoiceLinea }) {
  const taraTotal =
    linea.taraPorSaco !== null && linea.numeroSacos !== null ? linea.taraPorSaco * linea.numeroSacos : null;

  return (
    <tr>
      <td>{linea.productoNombre}</td>
      <td>{linea.pesoBruto !== null ? numero(linea.pesoBruto) : '—'}</td>
      <td>{linea.numeroSacos ?? '—'}</td>
      <td>{taraTotal !== null ? numero(taraTotal) : '—'}</td>
      <td>{numero(linea.libras)}</td>
      <td>{linea.porcentajeOro !== null ? `${numero(linea.porcentajeOro)} %` : '—'}</td>
      <td>{linea.quintalesOro !== null ? numero(linea.quintalesOro) : '—'}</td>
      <td>{linea.precioPorLibra !== null ? lempiras(linea.precioPorLibra) : '—'}</td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

function FilaVenta({ linea }: { linea: InvoiceLinea }) {
  // En modo oro el precio es por quintal oro y no por libra: se rotula distinto
  // para que nadie lea un precio por quintal como si fuera por libra.
  const precio =
    linea.precioPorQuintalOro !== null
      ? `${lempiras(linea.precioPorQuintalOro)} / qq oro`
      : linea.precioPorLibra !== null
        ? `${lempiras(linea.precioPorLibra)} / lb`
        : '—';

  return (
    <tr>
      <td>
        {linea.productoNombre}
        {linea.descripcion ? <div className="invoice-linea-desc">{linea.descripcion}</div> : null}
      </td>
      <td>{linea.libras > 0 ? numero(linea.libras) : '—'}</td>
      <td>{linea.porcentajeOro !== null ? `${numero(linea.porcentajeOro)} %` : '—'}</td>
      <td>{linea.quintalesOro !== null ? numero(linea.quintalesOro) : '—'}</td>
      <td>{precio}</td>
      <td>{lempiras(linea.total)}</td>
    </tr>
  );
}

export default function InvoiceA4({ data }: { data: InvoiceData }) {
  const esCompra = data.kind === 'compra';
  const { empresa, cliente, lineas } = data;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <article className="invoice-sheet">
        <header className="invoice-top">
          <div>
            <p className="invoice-empresa-nombre">{empresa.nombre || 'Empresa sin nombre'}</p>
            {empresa.rtn ? <p className="invoice-empresa-dato">RTN {empresa.rtn}</p> : null}
            {empresa.direccion ? <p className="invoice-empresa-dato">{empresa.direccion}</p> : null}
            {empresa.telefono ? <p className="invoice-empresa-dato">Tel. {empresa.telefono}</p> : null}
            {empresa.email ? <p className="invoice-empresa-dato">{empresa.email}</p> : null}
          </div>

          <dl className="invoice-meta">
            <p className="invoice-titulo">{data.titulo}</p>
            {data.numeroFactura ? (
              <div className="invoice-meta-fila invoice-folio">
                <dt>Factura No.</dt>
                <dd>{data.numeroFactura}</dd>
              </div>
            ) : null}
            <div className="invoice-meta-fila">
              <dt>Fecha</dt>
              <dd>{fechaLarga(data.businessDate)}</dd>
            </div>
            <div className="invoice-meta-fila">
              <dt>Sucursal</dt>
              <dd>{data.sucursalNombre}</dd>
            </div>
          </dl>
        </header>

        {empresa.fiscal ? (
          <section className="invoice-fiscal">
            <p>CAI: {empresa.fiscal.cai}</p>
            {empresa.fiscal.rangoDesde && empresa.fiscal.rangoHasta ? (
              <p>
                Rango autorizado: {empresa.fiscal.rangoDesde} a {empresa.fiscal.rangoHasta}
              </p>
            ) : null}
            {empresa.fiscal.fechaLimite ? <p>Fecha límite de emisión: {empresa.fiscal.fechaLimite}</p> : null}
          </section>
        ) : null}

        <section className="invoice-cliente">
          <Campo etiqueta={esCompra ? 'Productor' : 'Cliente'} valor={cliente.nombre} />
          <Campo etiqueta="Finca" valor={cliente.nombreFinca} />
          <Campo etiqueta="Clave IHCAFE" valor={cliente.claveIhcafe} />
          <Campo etiqueta="RTN" valor={cliente.rtn} />
          <Campo etiqueta="Teléfono" valor={cliente.telefono} />
          <Campo etiqueta="Dirección" valor={cliente.direccion} />
        </section>

        <table className="invoice-lineas">
          <thead>
            {esCompra ? (
              <tr>
                <th>Tipo de café</th>
                <th>Bruto (lb)</th>
                <th>Sacos</th>
                <th>Tara (lb)</th>
                <th>Neto (lb)</th>
                <th>Rend.</th>
                <th>QQ oro</th>
                <th>Precio / lb</th>
                <th>Valor</th>
              </tr>
            ) : (
              <tr>
                <th>Concepto</th>
                <th>Libras</th>
                <th>Rend.</th>
                <th>QQ oro</th>
                <th>Precio</th>
                <th>Valor</th>
              </tr>
            )}
          </thead>
          <tbody>
            {lineas.map((linea, indice) =>
              esCompra ? <FilaCompra key={indice} linea={linea} /> : <FilaVenta key={indice} linea={linea} />,
            )}
          </tbody>
          <tfoot>
            {esCompra ? (
              <tr>
                <td>Totales</td>
                <td colSpan={3} />
                <td>{numero(data.totalLibras)}</td>
                <td />
                <td>{data.totalQuintalesOro !== null ? numero(data.totalQuintalesOro) : '—'}</td>
                <td />
                <td>{lempiras(data.total)}</td>
              </tr>
            ) : (
              <tr>
                <td>Totales</td>
                <td>{data.totalLibras > 0 ? numero(data.totalLibras) : '—'}</td>
                <td />
                <td>{data.totalQuintalesOro !== null ? numero(data.totalQuintalesOro) : '—'}</td>
                <td />
                <td>{lempiras(data.total)}</td>
              </tr>
            )}
          </tfoot>
        </table>

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
    </>
  );
}
