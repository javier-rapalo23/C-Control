import {
  CLASIFICACION_FISCAL_MOLIDO,
  evaluarCai,
  formatNumeroFiscal,
  motivoNoEmitible,
  tasaIsv,
} from '@/lib/fiscal';

/**
 * Reglas del CAI sin base de datos. Son las que deciden si se puede emitir y con
 * qué número, así que conviene fijarlas antes de que la emisión las use.
 */

const CAI_BASE = {
  rangoDesde: 1,
  rangoHasta: 100,
  fechaLimite: '2026-12-31',
  ultimoCorrelativo: 0,
  estado: 'activo',
  alertaPorcentaje: 80,
  alertaDiasPrevios: 30,
};

const HOY = '2026-09-27';

describe('formatNumeroFiscal', () => {
  it('arma el número con los cuatro segmentos y ocho dígitos de correlativo', () => {
    expect(
      formatNumeroFiscal({
        codigoEstablecimiento: '001',
        codigoPuntoEmision: '002',
        codigoTipoDocumento: '04',
        correlativo: 123,
      }),
    ).toBe('001-002-04-00000123');
  });

  // Los códigos vienen de un formulario; si alguien escribe "1" en vez de "001" el
  // número impreso no debe quedar corrido.
  it('rellena con ceros los códigos cortos', () => {
    expect(
      formatNumeroFiscal({
        codigoEstablecimiento: '1',
        codigoPuntoEmision: '1',
        codigoTipoDocumento: '1',
        correlativo: 1,
      }),
    ).toBe('001-001-01-00000001');
  });
});

describe('tasaIsv', () => {
  it('deja el café en cero y grava el servicio de molido al 15 %', () => {
    expect(tasaIsv('EXENTO')).toBe(0);
    expect(tasaIsv('EXONERADO')).toBe(0);
    expect(tasaIsv(CLASIFICACION_FISCAL_MOLIDO)).toBe(0.15);
  });

  // Una clasificación desconocida no puede inventar impuesto.
  it('devuelve cero para una clasificación que no existe', () => {
    expect(tasaIsv('CUALQUIERA')).toBe(0);
  });
});

describe('evaluarCai', () => {
  it('cuenta usados y disponibles, y dice qué número sigue', () => {
    const estado = evaluarCai({ ...CAI_BASE, ultimoCorrelativo: 40 }, HOY);

    expect(estado.total).toBe(100);
    expect(estado.usados).toBe(40);
    expect(estado.disponibles).toBe(60);
    expect(estado.porcentajeUsado).toBe(40);
    expect(estado.siguienteCorrelativo).toBe(41);
    expect(estado.puedeEmitir).toBe(true);
  });

  // Un CAI nuevo trae el contador en 0 aunque su rango empiece en otro número: sin
  // esto, un rango 500–600 aparecería con 500 documentos ya usados.
  it('no cuenta como usados los números anteriores al inicio del rango', () => {
    const estado = evaluarCai({ ...CAI_BASE, rangoDesde: 500, rangoHasta: 600, ultimoCorrelativo: 0 }, HOY);

    expect(estado.usados).toBe(0);
    expect(estado.disponibles).toBe(101);
    expect(estado.siguienteCorrelativo).toBe(500);
  });

  it('se agota al entregar el último número del rango', () => {
    const estado = evaluarCai({ ...CAI_BASE, ultimoCorrelativo: 100 }, HOY);

    expect(estado.agotado).toBe(true);
    expect(estado.disponibles).toBe(0);
    expect(estado.puedeEmitir).toBe(false);
    expect(estado.siguienteCorrelativo).toBeNull();
    expect(motivoNoEmitible(estado, true)).toContain('rango');
  });

  it('vence el día siguiente a la fecha límite, no el mismo día', () => {
    const elMismoDia = evaluarCai({ ...CAI_BASE, fechaLimite: HOY }, HOY);
    expect(elMismoDia.vencido).toBe(false);
    expect(elMismoDia.diasParaVencer).toBe(0);
    expect(elMismoDia.puedeEmitir).toBe(true);

    const alDiaSiguiente = evaluarCai({ ...CAI_BASE, fechaLimite: '2026-09-26' }, HOY);
    expect(alDiaSiguiente.vencido).toBe(true);
    expect(alDiaSiguiente.diasParaVencer).toBe(-1);
    expect(alDiaSiguiente.puedeEmitir).toBe(false);
    expect(motivoNoEmitible(alDiaSiguiente, true)).toContain('fecha límite');
  });

  it('avisa al cruzar el umbral de rango y el de vencimiento', () => {
    const rango = evaluarCai({ ...CAI_BASE, ultimoCorrelativo: 80 }, HOY);
    expect(rango.alertaRango).toBe(true);
    expect(rango.alertaVencimiento).toBe(false);

    const vencimiento = evaluarCai({ ...CAI_BASE, fechaLimite: '2026-10-20' }, HOY);
    expect(vencimiento.alertaVencimiento).toBe(true);
    expect(vencimiento.alertaRango).toBe(false);
  });

  it('un CAI inactivo no emite aunque tenga rango y vigencia', () => {
    const estado = evaluarCai({ ...CAI_BASE, estado: 'inactivo' }, HOY);

    expect(estado.puedeEmitir).toBe(false);
    expect(estado.siguienteCorrelativo).toBeNull();
    expect(motivoNoEmitible(estado, false)).toContain('inactivo');
  });
});
