import { addDays, endOfMonth, format, parse } from 'date-fns';

/**
 * All dates in Firestore are local-calendar ids: 'YYYY-MM-DD' for days and
 * 'YYYY-MM' for months. Local time is used on purpose: Dhaka is UTC+6, so a
 * UTC-based id would put a 01:00 entry on the previous day.
 */
export function todayId(now = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export function monthIdOf(date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function monthOfDate(dateId: string): string {
  return dateId.slice(0, 7);
}

export function isInMonth(dateId: string, monthId: string): boolean {
  return dateId.startsWith(monthId);
}

/** First and last day ids of a month, for Firestore range queries on `date`. */
export function monthRange(monthId: string): { start: string; end: string } {
  const first = parse(`${monthId}-01`, 'yyyy-MM-dd', new Date());
  return { start: `${monthId}-01`, end: format(endOfMonth(first), 'yyyy-MM-dd') };
}

export function shiftDateId(dateId: string, days: number): string {
  return format(addDays(parse(dateId, 'yyyy-MM-dd', new Date()), days), 'yyyy-MM-dd');
}

export function formatDateId(dateId: string, pattern = 'd MMM'): string {
  return format(parse(dateId, 'yyyy-MM-dd', new Date()), pattern);
}

export function formatMonthId(monthId: string, pattern = 'MMMM yyyy'): string {
  return format(parse(`${monthId}-01`, 'yyyy-MM-dd', new Date()), pattern);
}
