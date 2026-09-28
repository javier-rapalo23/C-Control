import {
  CLASIFICACION_FISCAL_MOLIDO,
  TIPO_DOCUMENTO_POR_ORIGEN,
  desgloseIsv,
  evaluarCai,
  formatNumeroFiscal,
  motivoNoEmitible,
  puedeAnularse,
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

describe('TIPO_DOCUMENTO_POR_ORIGEN', () => {
  // Es un mapa explícito porque las notas de crédito también "aplican" a una venta:
  // elegir por coincidencia daría una nota de crédito donde va una factura.
  it('la compra va con boleta y la venta y el molido con factura', () => {
    expect(TIPO_DOCUMENTO_POR_ORIGEN.compra).toBe('boleta_compra');
    expect(TIPO_DOCUMENTO_POR_ORIGEN.venta).toBe('factura');
    expect(TIPO_DOCUMENTO_POR_ORIGEN.molido).toBe('factura');
  });
});

describe('desgloseIsv', () => {
  it('deja el café completo como exento y sin impuesto', () => {
    const desglose = desgloseIsv([
      { monto: 25_014, clasificacionFiscal: 'EXENTO' },
      { monto: 1_000, clasificacionFiscal: 'EXENTO' },
    ]);

    expect(desglose.importeExento).toBe(26_014);
    expect(desglose.importeGravado15).toBe(0);
    expect(desglose.isv15).toBe(0);
    expect(desglose.total).toBe(26_014);
  });

  // El molido se cobra con el ISV dentro: la base se saca hacia atrás y el impuesto
  // es la diferencia, para que base + ISV dé exactamente lo cobrado.
  it('saca la base hacia atrás cuando el monto ya incluye el ISV', () => {
    const desglose = desgloseIsv([
      { monto: 100, clasificacionFiscal: CLASIFICACION_FISCAL_MOLIDO, isvIncluido: true },
    ]);

    expect(desglose.importeGravado15).toBe(86.96);
    expect(desglose.isv15).toBe(13.04);
    expect(desglose.importeGravado15 + desglose.isv15).toBe(100);
    expect(desglose.total).toBe(100);
  });

  // Un monto que no divide exacto es donde aparecería el descuadre de un centavo.
  it('no descuadra con montos que no dividen exacto', () => {
    for (const monto of [10, 33.33, 57.75, 999.99]) {
      const desglose = desgloseIsv([
        { monto, clasificacionFiscal: CLASIFICACION_FISCAL_MOLIDO, isvIncluido: true },
      ]);
      expect(Number((desglose.importeGravado15 + desglose.isv15).toFixed(2))).toBe(monto);
      expect(desglose.total).toBe(monto);
    }
  });

  it('suma el impuesto al total cuando el monto no lo incluye', () => {
    const desglose = desgloseIsv([{ monto: 100, clasificacionFiscal: 'GRAVADO_15' }]);

    expect(desglose.importeGravado15).toBe(100);
    expect(desglose.isv15).toBe(15);
    expect(desglose.total).toBe(115);
  });
});

describe('puedeAnularse', () => {
  it('solo el mismo día de la emisión', () => {
    // 2026-09-27 a las 14:00 de Honduras son las 20:00 UTC.
    const emitido = new Date('2026-09-27T20:00:00.000Z');
    expect(puedeAnularse(emitido, '2026-09-27')).toBe(true);
    expect(puedeAnularse(emitido, '2026-09-28')).toBe(false);
  });

  // A las 19:00 de Honduras el UTC ya está en el día siguiente: comparar sin la zona
  // habría dado por vencido el plazo antes de que terminara el día del negocio.
  it('usa la fecha de Honduras y no la del servidor', () => {
    const emitidoDeNoche = new Date('2026-09-28T02:00:00.000Z'); // 27 a las 20:00 en HN
    expect(puedeAnularse(emitidoDeNoche, '2026-09-27')).toBe(true);
    expect(puedeAnularse(emitidoDeNoche, '2026-09-28')).toBe(false);
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
