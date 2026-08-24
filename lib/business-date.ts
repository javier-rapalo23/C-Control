const BUSINESS_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_TIMEZONE = 'America/Tegucigalpa';

export function parseBusinessDate(input: string): Date {
  if (!BUSINESS_DATE_REGEX.test(input)) {
    throw new Error('businessDate must be in YYYY-MM-DD format');
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid businessDate');
  }

  return date;
}

export function toBusinessDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayBusinessDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}

/**
 * La semana de negocio va de **domingo a sábado**. Es la definición que comparten
 * los reportes semanales y el corte de planilla, para que ambos hablen del mismo
 * período.
 *
 * La aritmética se hace en UTC a propósito: `parseBusinessDate` construye siempre
 * medianoche UTC y las columnas son `@db.Date`, así que sumar días no puede
 * cruzarse con el horario local.
 */
export function startOfBusinessWeek(input: string): string {
  const date = parseBusinessDate(input);
  // getUTCDay(): 0 = domingo, que es justo el desplazamiento al inicio de semana.
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return toBusinessDateString(date);
}

export function endOfBusinessWeek(input: string): string {
  return addBusinessDays(startOfBusinessWeek(input), 6);
}

export function addBusinessDays(input: string, days: number): string {
  const date = parseBusinessDate(input);
  date.setUTCDate(date.getUTCDate() + days);
  return toBusinessDateString(date);
}

/** Días entre dos fechas, ambas incluidas. */
export function eachBusinessDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addBusinessDays(current, 1);
  }
  return dates;
}

/** Semanas que cubren el rango, recortadas a los límites pedidos. */
export function eachBusinessWeek(from: string, to: string): Array<{ inicio: string; fin: string }> {
  const weeks: Array<{ inicio: string; fin: string }> = [];
  let cursor = startOfBusinessWeek(from);

  while (cursor <= to) {
    const weekEnd = endOfBusinessWeek(cursor);
    weeks.push({
      inicio: cursor < from ? from : cursor,
      fin: weekEnd > to ? to : weekEnd,
    });
    cursor = addBusinessDays(cursor, 7);
  }

  return weeks;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta corta para encabezados y tickets: `12 – 18 ene 2026`. */
export function formatBusinessRange(from: string, to: string): string {
  const [, fromMonth, fromDay] = from.split('-');
  const [toYear, toMonth, toDay] = to.split('-');
  const start = `${Number(fromDay)}${fromMonth === toMonth ? '' : ` ${MONTHS_ES[Number(fromMonth) - 1]}`}`;
  return `${start} – ${Number(toDay)} ${MONTHS_ES[Number(toMonth) - 1]} ${toYear}`;
}
