/** Formatting helpers for dashboard editorial cards (INR / Indian FY). */

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export interface MonthSpendRow {
  label: string;
  debit: number;
}

export interface QuarterSpendRow {
  label: string;
  debit: number;
  months: string;
}

/** Full INR with rupee symbol. */
export function formatINR(value: number, options?: { maximumFractionDigits?: number }): string {
  const formatted = value.toLocaleString("en-IN", {
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    minimumFractionDigits: 0,
  });
  return `₹${formatted}`;
}

/** Compact lakh notation (e.g. 7.00L). */
export function formatLakh(value: number): string {
  if (value === 0) return "0";
  const lakhs = value / 100_000;
  if (lakhs >= 100) return `${(lakhs / 100).toFixed(2)}Cr`;
  if (lakhs >= 1) return `${lakhs.toFixed(2)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Short k label for month rings (e.g. 42000 → 42k). */
export function formatCompactK(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

/** Parse YYYY-MM label to month index 1-12. */
export function parseYearMonth(label: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Indian FY quarters: Q1 Apr–Jun … Q4 Jan–Mar. */
export function quarterFromYearMonth(month: number): "Q1" | "Q2" | "Q3" | "Q4" {
  if (month >= 4 && month <= 6) return "Q1";
  if (month >= 7 && month <= 9) return "Q2";
  if (month >= 10 && month <= 12) return "Q3";
  return "Q4";
}

const QUARTER_MONTHS: Record<string, string> = {
  Q1: "Apr–Jun",
  Q2: "Jul–Sep",
  Q3: "Oct–Dec",
  Q4: "Jan–Mar",
};

/** Roll monthly debit rows into FY quarters. */
export function rollupQuarters(byMonth: MonthSpendRow[]): QuarterSpendRow[] {
  const totals: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const row of byMonth) {
    const parsed = parseYearMonth(row.label);
    if (!parsed) continue;
    const q = quarterFromYearMonth(parsed.month);
    totals[q] += row.debit;
  }
  return (["Q1", "Q2", "Q3", "Q4"] as const).map((label) => ({
    label,
    debit: totals[label],
    months: QUARTER_MONTHS[label],
  }));
}

/** Label for month ring from YYYY-MM. */
export function monthShortLabel(ym: string): string {
  const parsed = parseYearMonth(ym);
  if (!parsed) return ym;
  return MONTH_NAMES[parsed.month - 1] ?? ym;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 20;

/** SVG stroke-dasharray for progress ring (value vs max). */
export function ringDasharray(value: number, max: number): { dash: number; gap: number } {
  if (max <= 0) return { dash: 0, gap: RING_CIRCUMFERENCE };
  const ratio = Math.min(1, Math.max(0, value / max));
  const dash = ratio * RING_CIRCUMFERENCE;
  return { dash, gap: RING_CIRCUMFERENCE - dash };
}

/** Percent of total for bar widths. */
export function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

/** Pick accent color by rank index. */
export function rankColor(index: number): string {
  const colors = ["var(--lime)", "var(--sky)", "var(--lavender)", "var(--gold)", "var(--coral)"];
  return colors[index % colors.length];
}
