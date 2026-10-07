import { notFound } from 'next/navigation';
import InvoiceToolbar from '@/components/invoice-toolbar';
import { prisma } from '@/lib/prisma';
import { todayBusinessDate } from '@/lib/business-date';
import { getAccountStatement } from '@/lib/receivables';
import { requireModuleAccess } from '@/lib/require-module-access';

type Params = {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const lempiras = (valor: number) =>
  `L ${valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismo truco que la factura (`invoice-a4.tsx`): al imprimir se oculta todo y se vuelve
// a mostrar solo el camino hasta la hoja.
const CSS = `
.invoice-toolbar {
  display: flex;
  justify-content: flex-end;
  max-width: 190mm;
  margin: 16px auto 0;
}
.estado-sheet {
  background: #fff;
  color: #111;
  max-width: 190mm;
  margin: 12px auto 24px;
  padding: 10mm 8mm;
  box-shadow: 0 1px 6px rgba(0,0,0,.15);
  font-size: 12px;
}
.estado-sheet h1 { font-size: 18px; margin: 0; }
.estado-sheet h2 { font-size: 14px; margin: 14px 0 6px; }
.estado-sheet table { width: 100%; border-collapse: collapse; margin-top: 6px; }
.estado-sheet th, .estado-sheet td { border-bottom: 1px solid #ccc; padding: 4px 6px; text-align: left; }
.estado-sheet td.num, .estado-sheet th.num { text-align: right; white-space: nowrap; }
.estado-sheet tfoot td { font-weight: 700; border-top: 2px solid #111; }
.estado-encabezado { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }
.estado-saldo { font-size: 16px; font-weight: 700; }
@media print {
  body > *,
  .app-shell > *,
  .app-main > * { display: none !important; }
  body > .app-shell,
  .app-shell > .app-main,
  .app-main > .estado-sheet { display: block !important; }
  .estado-sheet { box-shadow: none; margin: 0; max-width: none; padding: 0; }
  .estado-sheet thead { display: table-header-group; }
}
`;

export default async function EstadoCuentaPrintPage({ params, searchParams }: Params) {
  await requireModuleAccess('receivables');

  const { clientId } = await params;
  const query = await searchParams;
  const desde = query.desde && FECHA.test(query.desde) ? query.desde : null;
  const hasta = query.hasta && FECHA.test(query.hasta) ? query.hasta : null;
  const hoy = todayBusinessDate();

  const [statement, empresa] = await Promise.all([
    getAccountStatement(prisma, clientId, { desde, hasta, hoy }),
    prisma.companySettings.findUnique({ where: { id: 'singleton' } }),
  ]);
  if (!statement) notFound();

  const periodo = desde || hasta ? `${desde ?? 'inicio'} al ${hasta ?? hoy}` : `al ${hoy}`;

  return (
    <>
      <style>{CSS}</style>
      <InvoiceToolbar />
      <div className="estado-sheet">
        <div className="estado-encabezado">
          <div>
            <h1>{empresa?.nombre || 'Estado de cuenta'}</h1>
            {empresa?.rtn ? <div>RTN {empresa.rtn}</div> : null}
            {empresa?.direccion ? <div>{empresa.direccion}</div> : null}
            {empresa?.telefono ? <div>Tel. {empresa.telefono}</div> : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>ESTADO DE CUENTA</strong>
            <div>Período: {periodo}</div>
            <div>Emitido: {hoy}</div>
          </div>
        </div>

        <h2>Cliente</h2>
        <div>
          <strong>{statement.client.nombre}</strong>
          {statement.client.rtn ? ` · RTN ${statement.client.rtn}` : ''}
          {statement.client.claveIhcafe ? ` · IHCAFE ${statement.client.claveIhcafe}` : ''}
          {statement.client.telefono ? ` · Tel. ${statement.client.telefono}` : ''}
        </div>

        <h2>Movimientos</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Detalle</th>
              <th className="num">Cargo</th>
              <th className="num">Abono</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5}>Saldo anterior</td>
              <td className="num">{lempiras(statement.saldoAnterior)}</td>
            </tr>
            {statement.movimientos.map((movimiento) => (
              <tr key={`${movimiento.tipo}-${movimiento.id}`}>
                <td>{movimiento.businessDate}</td>
                <td>{movimiento.documento}</td>
                <td>{movimiento.detalle}</td>
                <td className="num">{movimiento.cargo ? lempiras(movimiento.cargo) : ''}</td>
                <td className="num">{movimiento.abono ? lempiras(movimiento.abono) : ''}</td>
                <td className="num">{lempiras(movimiento.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Totales</td>
              <td className="num">{lempiras(statement.totalCargos)}</td>
              <td className="num">{lempiras(statement.totalAbonos)}</td>
              <td className="num">{lempiras(statement.saldoFinal)}</td>
            </tr>
          </tfoot>
        </table>

        <h2>Facturas pendientes al {hoy}</h2>
        {statement.pendientes.length === 0 ? (
          <p>Sin facturas pendientes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Venta</th>
                <th>Factura</th>
                <th className="num">Días</th>
                <th className="num">Total</th>
                <th className="num">Abonado</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {statement.pendientes.map((venta) => (
                <tr key={venta.id}>
                  <td>{venta.businessDate}</td>
                  <td>{venta.numeroInterno}</td>
                  <td>{venta.numeroFiscal ?? '—'}</td>
                  <td className="num">{venta.dias}</td>
                  <td className="num">{lempiras(venta.total)}</td>
                  <td className="num">{lempiras(venta.abonado)}</td>
                  <td className="num">{lempiras(venta.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="estado-saldo" style={{ textAlign: 'right', marginTop: 12 }}>
          Saldo pendiente: {lempiras(statement.saldoActual)}
        </p>
      </div>
    </>
  );
}
