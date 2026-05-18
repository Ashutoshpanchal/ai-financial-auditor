/** ISO YYYY-MM-DD from local calendar date. */
export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse ISO date as local midnight, or null if invalid. */
export function parseIsoDate(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Compare two ISO strings; -1 if a<b, 0 if equal, 1 if a>b. */
export function compareIso(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export interface CalendarCell {
  /** Local calendar date at midnight. */
  date: Date;
  iso: string;
  inCurrentMonth: boolean;
}

/**
 * Build a 6×7 grid for ``year`` / ``monthIndex`` (0–11), week starting Monday.
 */
export function buildCalendarWeeks(year: number, monthIndex: number): CalendarCell[][] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const weeks: CalendarCell[][] = [];
  const cur = new Date(gridStart);
  for (let w = 0; w < 6; w += 1) {
    const row: CalendarCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      row.push({
        date: new Date(cur),
        iso: toIsoDateLocal(cur),
        inCurrentMonth: cur.getMonth() === monthIndex,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export function isIsoDateDisabled(
  iso: string,
  minDate: string | undefined,
  maxDate: string | undefined,
): boolean {
  if (minDate && compareIso(iso, minDate) < 0) return true;
  if (maxDate && compareIso(iso, maxDate) > 0) return true;
  return false;
}
