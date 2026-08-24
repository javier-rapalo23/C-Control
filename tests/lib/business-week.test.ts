import {
  addBusinessDays,
  eachBusinessDate,
  eachBusinessWeek,
  endOfBusinessWeek,
  formatBusinessRange,
  startOfBusinessWeek,
} from '@/lib/business-date';

describe('semana de negocio (domingo a sábado)', () => {
  it('un miércoles retrocede al domingo anterior', () => {
    // 2026-08-19 es miércoles.
    expect(startOfBusinessWeek('2026-08-19')).toBe('2026-08-16');
    expect(endOfBusinessWeek('2026-08-19')).toBe('2026-08-22');
  });

  it('un domingo es su propio inicio de semana', () => {
    expect(startOfBusinessWeek('2026-08-16')).toBe('2026-08-16');
    expect(endOfBusinessWeek('2026-08-16')).toBe('2026-08-22');
  });

  it('un sábado cierra su semana sin saltar a la siguiente', () => {
    expect(startOfBusinessWeek('2026-08-22')).toBe('2026-08-16');
    expect(endOfBusinessWeek('2026-08-22')).toBe('2026-08-22');
  });

  it('cruza fin de mes y de año', () => {
    expect(startOfBusinessWeek('2026-01-01')).toBe('2025-12-28');
    expect(endOfBusinessWeek('2025-12-31')).toBe('2026-01-03');
  });

  it('atraviesa el cambio de horario sin desfasarse un día', () => {
    // Marzo es donde una implementación con hora local se corre 23/25 horas.
    expect(addBusinessDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(startOfBusinessWeek('2026-03-10')).toBe('2026-03-08');
  });
});

describe('eachBusinessDate', () => {
  it('incluye ambos extremos', () => {
    expect(eachBusinessDate('2026-08-16', '2026-08-19')).toEqual([
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ]);
  });

  it('devuelve un solo día cuando el rango es de un día', () => {
    expect(eachBusinessDate('2026-08-16', '2026-08-16')).toEqual(['2026-08-16']);
  });

  it('devuelve vacío si el rango está invertido', () => {
    expect(eachBusinessDate('2026-08-19', '2026-08-16')).toEqual([]);
  });
});

describe('eachBusinessWeek', () => {
  it('recorta la primera y la última semana a los límites del rango', () => {
    expect(eachBusinessWeek('2026-08-19', '2026-08-26')).toEqual([
      { inicio: '2026-08-19', fin: '2026-08-22' },
      { inicio: '2026-08-23', fin: '2026-08-26' },
    ]);
  });

  it('devuelve semanas completas cuando el rango ya está alineado', () => {
    expect(eachBusinessWeek('2026-08-16', '2026-08-29')).toEqual([
      { inicio: '2026-08-16', fin: '2026-08-22' },
      { inicio: '2026-08-23', fin: '2026-08-29' },
    ]);
  });
});

describe('formatBusinessRange', () => {
  it('omite el mes repetido', () => {
    expect(formatBusinessRange('2026-08-16', '2026-08-22')).toBe('16 – 22 ago 2026');
  });

  it('muestra ambos meses cuando la semana los cruza', () => {
    expect(formatBusinessRange('2026-08-30', '2026-09-05')).toBe('30 ago – 5 sep 2026');
  });
});
