/** Preset keys for the shared date-range picker. */
export type DateRangePreset =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
];

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year: "This year",
  last_year: "Last year",
};

export interface TransactionDateScope {
  min_date: string | null;
  max_date: string | null;
  months_with_data: string[];
  has_transactions: boolean;
}

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

/** Intersect a range with the user's transaction bounds. */
export function clampRangeToScope(
  from: string,
  to: string,
  scope: TransactionDateScope | null,
): DateRangeValue {
  if (!scope?.min_date || !scope?.max_date) {
    return { from, to };
  }
  const f = from < scope.min_date ? scope.min_date : from;
  const t = to > scope.max_date ? scope.max_date : to;
  if (f > t) {
    return { from: scope.min_date, to: scope.max_date };
  }
  return { from: f, to: t };
}

/** Apply preset and return null when the clamped range is empty. */
export function applyPreset(
  preset: DateRangePreset,
  scope: TransactionDateScope | null,
  today: Date = new Date(),
): DateRangeValue | null {
  const raw = getPresetRange(preset, today);
  const clamped = clampRangeToScope(raw.from, raw.to, scope);
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
  for (const preset of DATE_RANGE_PRESETS) {
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
