/** Preset keys for the shared date-range picker. */
import type { TransactionDateScope } from "../services/api";

export type { TransactionDateScope } from "../services/api";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

/** Order shown in the picker left rail (quick options first, then weeks/quarters/years). */
export const PICKER_PRESET_ORDER: DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "this_week",
  "last_week",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
];

/** @deprecated Use PICKER_PRESET_ORDER — kept for tests that iterate “standard” periods only. */
export const DATE_RANGE_PRESETS: DateRangePreset[] = PICKER_PRESET_ORDER;

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year: "This year",
  last_year: "Last year",
};

export interface DateRangeValue {
  from: string;
  to: string;
}

/** ISO date string YYYY-MM-DD for a Date in local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last calendar day of YYYY-MM as ISO date. */
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0);
  return toIsoDate(d);
}

function startOfIsoWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfIsoWeek(d: Date): Date {
  const start = startOfIsoWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function quarterBounds(year: number, quarter: 1 | 2 | 3 | 4): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0);
  return { from, to };
}

function currentQuarter(d: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Calendar bounds for a preset (not clamped to transaction scope). */
export function getPresetRange(preset: DateRangePreset, today: Date = new Date()): DateRangeValue {
  const y = today.getFullYear();
  const m = today.getMonth();

  switch (preset) {
    case "today": {
      const iso = toIsoDate(today);
      return { from: iso, to: iso };
    }
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      const iso = toIsoDate(d);
      return { from: iso, to: iso };
    }
    case "last_7_days": {
      const to = new Date(today);
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "last_30_days": {
      const to = new Date(today);
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "this_week": {
      const from = startOfIsoWeek(today);
      const to = endOfIsoWeek(today);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "last_week": {
      const lastWeekAnchor = new Date(today);
      lastWeekAnchor.setDate(lastWeekAnchor.getDate() - 7);
      const from = startOfIsoWeek(lastWeekAnchor);
      const to = endOfIsoWeek(lastWeekAnchor);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "this_month": {
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "last_month": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "this_quarter": {
      const q = currentQuarter(today);
      const { from, to } = quarterBounds(y, q);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "last_quarter": {
      const q = currentQuarter(today);
      if (q === 1) {
        const { from, to } = quarterBounds(y - 1, 4);
        return { from: toIsoDate(from), to: toIsoDate(to) };
      }
      const { from, to } = quarterBounds(y, (q - 1) as 1 | 2 | 3 | 4);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "this_year": {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "last_year": {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    }
  }
}

/** Normalize API date to YYYY-MM-DD for comparisons. */
export function normalizeScopeBound(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const trimmed = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function parseYmd(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function addDaysIso(iso: string, deltaDays: number): string {
  const d = parseYmd(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + deltaDays);
  return toIsoDate(d);
}

/** Inclusive day count between two ISO dates (minimum 1). */
function daysBetweenInclusive(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/**
 * Intersect [from, to] with transaction scope.
 * When the preset falls entirely outside data, slide the window to fit (preserve span) instead of using full min–max.
 */
export function clampRangeToScope(
  from: string,
  to: string,
  scope: TransactionDateScope | null,
): DateRangeValue {
  const a = from.trim();
  const b = to.trim();
  if (!a && !b) {
    return { from: "", to: "" };
  }
  let effFrom = a;
  let effTo = b;
  if (!effFrom) effFrom = effTo;
  if (!effTo) effTo = effFrom;
  if (effFrom > effTo) {
    [effFrom, effTo] = [effTo, effFrom];
  }

  const minDate = normalizeScopeBound(scope?.min_date);
  const maxDate = normalizeScopeBound(scope?.max_date);
  if (!minDate || !maxDate) {
    return { from: effFrom, to: effTo };
  }

  const interFrom = effFrom < minDate ? minDate : effFrom;
  const interTo = effTo > maxDate ? maxDate : effTo;
  if (interFrom <= interTo) {
    return { from: interFrom, to: interTo };
  }

  if (effFrom === effTo) {
    if (effFrom > maxDate) return { from: maxDate, to: maxDate };
    if (effFrom < minDate) return { from: minDate, to: minDate };
  }

  const spanDays = daysBetweenInclusive(effFrom, effTo);

  if (effFrom > maxDate) {
    const end = maxDate;
    let start = addDaysIso(end, -(spanDays - 1));
    if (start < minDate) start = minDate;
    return { from: start, to: end };
  }

  if (effTo < minDate) {
    const start = minDate;
    let end = addDaysIso(start, spanDays - 1);
    if (end > maxDate) end = maxDate;
    return { from: start, to: end };
  }

  return { from: minDate, to: maxDate };
}

/** Presets that mean a specific calendar day, not “latest day with data”. */
const CALENDAR_DAY_PRESETS = new Set<DateRangePreset>(["today", "yesterday"]);

/**
 * Keep today/yesterday on the real calendar date even when transactions end earlier.
 * Still snaps to min_date when the calendar day is before the first transaction.
 */
function applyCalendarDayPreset(
  raw: DateRangeValue,
  scope: TransactionDateScope | null,
): DateRangeValue {
  const minDate = normalizeScopeBound(scope?.min_date);
  let { from, to } = raw;
  if (minDate && from < minDate) {
    from = minDate;
    to = minDate;
  }
  return { from, to };
}

/** Apply preset and return null when the clamped range is empty. */
export function applyPreset(
  preset: DateRangePreset,
  scope: TransactionDateScope | null,
  today: Date = new Date(),
): DateRangeValue | null {
  const raw = getPresetRange(preset, today);
  const clamped = CALENDAR_DAY_PRESETS.has(preset)
    ? applyCalendarDayPreset(raw, scope)
    : clampRangeToScope(raw.from, raw.to, scope);
  if (clamped.from > clamped.to) {
    return null;
  }
  return clamped;
}

/** Most recent calendar month with transactions, walking back from last month. */
export function resolveDefaultRange(
  scope: TransactionDateScope | null,
  today: Date = new Date(),
): DateRangeValue | null {
  if (!scope?.has_transactions || scope.months_with_data.length === 0) {
    return null;
  }
  const monthSet = new Set(scope.months_with_data);
  const cursor = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  for (let i = 0; i < 36; i += 1) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    if (monthSet.has(ym)) {
      return { from: `${ym}-01`, to: lastDayOfMonth(ym) };
    }
    cursor.setMonth(cursor.getMonth() - 1);
  }

  const latest = scope.months_with_data[scope.months_with_data.length - 1]!;
  return { from: `${latest}-01`, to: lastDayOfMonth(latest) };
}

/** Detect matching preset for exact from/to (after clamp). */
export function detectPreset(
  from: string,
  to: string,
  scope: TransactionDateScope | null,
  today: Date = new Date(),
): DateRangePreset | null {
  for (const preset of PICKER_PRESET_ORDER) {
    const applied = applyPreset(preset, scope, today);
    if (applied && applied.from === from && applied.to === to) {
      return preset;
    }
  }
  return null;
}

/** Human-readable label for the picker trigger. */
export function formatDateRangeLabel(
  from: string,
  to: string,
  preset: DateRangePreset | null,
): string {
  if (preset) {
    return PRESET_LABELS[preset];
  }
  if (!from && !to) {
    return "Select dates";
  }
  if (from && to) {
    return `${from} ~ ${to}`;
  }
  const fmt = (iso: string) => {
    const [y, mo, d] = iso.split("-").map(Number);
    if (!y || !mo || !d) return iso;
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}
