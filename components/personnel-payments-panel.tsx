'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { EmployeeDTO, EmployeePaymentDTO } from '@/types/domain';
import { useSucursal } from '@/lib/use-sucursal';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function PersonnelPaymentsPanel() {
  const { sucursales, sucursalId, setSucursalId } = useSucursal();
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [payments, setPayments] = useState<EmployeePaymentDTO[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayDateString());
  const [paymentConcepto, setPaymentConcepto] = useState('Salario');
  const [paymentMonto, setPaymentMonto] = useState('');

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`/api/employees?sucursalId=${sucursalId}`, { cache: 'no-store' });
      const data = await parseApiResponse<EmployeeDTO[]>(res);
      setEmployees(data);
      setPaymentEmployeeId((current) => current || (data.length > 0 ? data[0].id : ''));
    } catch {
      // ignore errors fetching employees for the select
    }
  }, [sucursalId]);

  const fetchPayments = useCallback(async () => {
    try {
      setPaymentsLoading(true);
      const res = await fetch(`/api/employees/payments?sucursalId=${sucursalId}`, { cache: 'no-store' });
      const data = await parseApiResponse<EmployeePaymentDTO[]>(res);
      setPayments(data);
      setPaymentsError(null);
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Error cargando pagos');
    } finally {
      setPaymentsLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    void fetchEmployees();
    void fetchPayments();
  }, [fetchEmployees, fetchPayments]);

  async function registrarPago(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentEmployeeId) {
      setPaymentsError('Selecciona un empleado.');
      return;
    }
    try {
      setPaymentsLoading(true);
      setPaymentsError(null);
      await fetch('/api/employees/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessDate: paymentDate,
          employeeId: paymentEmployeeId,
          concepto: paymentConcepto,
          monto: Number(paymentMonto),
        }),
      }).then(parseApiResponse);

      setPaymentMonto('');
      await fetchPayments();
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Error registrando pago');
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function deletePayment(id: string) {
    try {
      setPaymentsLoading(true);
      await fetch(`/api/employees/payments/${id}`, { method: 'DELETE' }).then(parseApiResponse);
      await fetchPayments();
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Error eliminando pago');
    } finally {
      setPaymentsLoading(false);
    }
  }

  const activeEmployees = employees.filter((e) => e.activo);

  return (
    <section className="card-grid">
      <article className="card wide">
        <h3>Registrar pago</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          <label style={{ gridColumn: 'span 6' }}>
            Sucursal
            <select value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {paymentsError ? <p style={{ color: 'var(--danger)' }}>{paymentsError}</p> : null}
        <form onSubmit={(e) => void registrarPago(e)} className="row" style={{ marginTop: 8 }}>
          <label style={{ gridColumn: 'span 8' }}>
            Empleado
            <select value={paymentEmployeeId} onChange={(e) => setPaymentEmployeeId(e.target.value)} required>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Fecha
            <input value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} type="date" required />
          </label>
          <label style={{ gridColumn: 'span 8' }}>
            Concepto
            <input value={paymentConcepto} onChange={(e) => setPaymentConcepto(e.target.value)} required />
          </label>
          <label style={{ gridColumn: 'span 4' }}>
            Monto
            <input value={paymentMonto} onChange={(e) => setPaymentMonto(e.target.value)} type="number" step="0.01" required />
          </label>
          <div style={{ gridColumn: 'span 12' }}>
            <button className="btn-primary" type="submit" disabled={paymentsLoading || !paymentEmployeeId}>
              {paymentsLoading ? 'Guardando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </article>

      <article className="card wide">
        <h3>Historial de pagos</h3>
        <table className="table-like" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Concepto</th>
              <th>Monto</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.businessDate}</td>
                <td>{payment.employeeNombre}</td>
                <td>{payment.concepto}</td>
                <td>L {payment.monto.toFixed(2)}</td>
                <td>
                  <button className="btn-danger" type="button" onClick={() => void deletePayment(payment.id)} disabled={paymentsLoading}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && !paymentsLoading ? (
              <tr>
                <td colSpan={5}>No hay pagos registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
