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