import { buildSummaryBuffer, type SummaryData } from '@/lib/thermal-printer';

const base: SummaryData = {
  company: { nombre: 'Acopio', rtn: '', telefono: '', direccion: '' },
  businessDate: '2026-08-24',
  productos: [],
  totalCompras: 1000,
  totalVentas: 0,
  totalGastos: 200,
  saldoInicial: 5000,
  saldoActual: 3800,
};

/** El buffer es ESC/POS; para verificar el contenido basta leer su texto. */
const render = (data: SummaryData) => buildSummaryBuffer(data).toString('latin1');

describe('buildSummaryBuffer — arqueo de caja', () => {
  it('sin sesión de caja imprime el cierre como estimado', () => {
    const out = render(base);
    expect(out).toContain('CIERRE EST. CAJA');
    expect(out).not.toContain('ARQUEO DE CAJA');
  });

  it('con caja abierta sigue siendo estimado, pero informa la apertura', () => {
    const out = render({
      ...base,
      arqueo: {
        estado: 'abierta',
        montoApertura: 5000,
        abiertaPor: 'ana',
        saldoEsperado: null,
        montoContado: null,
        diferencia: null,
        cerradaPor: null,
      },
    });

    expect(out).toContain('CIERRE EST. CAJA');
    expect(out).toContain('Caja abierta con:');
    expect(out).toContain('Abrio: ana');
    expect(out).not.toContain('ARQUEO DE CAJA');
  });

  it('con caja cerrada imprime el arqueo real y deja de decir estimado', () => {
    const out = render({
      ...base,
      saldoActual: 3750,
      arqueo: {
        estado: 'cerrada',
        montoApertura: 5000,
        abiertaPor: 'ana',
        saldoEsperado: 3800,
        montoContado: 3750,
        diferencia: -50,
        cerradaPor: 'beto',
      },
    });

    expect(out).toContain('ARQUEO DE CAJA');
    expect(out).toContain('Saldo esperado:');
    expect(out).toContain('3800.00');
    expect(out).toContain('Efectivo contado:');
    expect(out).toContain('3750.00');
    expect(out).toContain('CIERRE DE CAJA');
    expect(out).not.toContain('CIERRE EST. CAJA');
    expect(out).toContain('Cerro: beto');
  });

  it('nombra el signo de la diferencia, que en papel se malinterpreta', () => {
    const arqueo = {
      estado: 'cerrada' as const,
      montoApertura: 5000,
      abiertaPor: 'ana',
      saldoEsperado: 3800,
      cerradaPor: 'beto',
    };

    expect(render({ ...base, arqueo: { ...arqueo, montoContado: 3750, diferencia: -50 } })).toContain('FALTA');
    expect(render({ ...base, arqueo: { ...arqueo, montoContado: 3850, diferencia: 50 } })).toContain('SOBRA');
    expect(render({ ...base, arqueo: { ...arqueo, montoContado: 3800, diferencia: 0 } })).toContain('cuadra');
  });
});
