import type { CategoryFlowParentRow, CategoryFlowRow } from "../services/api";

export const MAX_INSIGHTS_SERIES = 10;

/** Recharts-safe key for a series label. */
export function seriesDataKey(label: string): string {
  return `s_${label.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "x") || "x"}`;
}

export interface PivotChartResult {
  chartData: Record<string, string | number>[];
  /** Human labels in chart order. */
  seriesLabels: string[];
  /** dataKey per label for Bar/Line. */
  seriesKeys: string[];
}

/** Pivot SC rows: one row per month, columns per sub-category. */
export function pivotScRows(
  rows: CategoryFlowRow[],
  metric: "debit" | "credit",
  compareSubs: Set<string> | null,
): PivotChartResult {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const subSet = new Set<string>();
  for (const r of rows) {
    if (compareSubs && compareSubs.size > 0 && !compareSubs.has(r.sub_category)) continue;
    subSet.add(r.sub_category);
  }
  let seriesLabels = [...subSet].sort();
  if (seriesLabels.length > MAX_INSIGHTS_SERIES) {
    seriesLabels = seriesLabels.slice(0, MAX_INSIGHTS_SERIES);
  }
  const seriesKeys = seriesLabels.map(seriesDataKey);

  const byMonth = new Map<string, Record<string, number>>();
  for (const m of months) {
    byMonth.set(m, {});
  }
  for (const r of rows) {
    if (!seriesLabels.includes(r.sub_category)) continue;
    const cell = byMonth.get(r.month);
    if (!cell) continue;
    const dk = seriesDataKey(r.sub_category);
    const v = metric === "debit" ? r.debit_total : r.credit_total;
    cell[dk] = (cell[dk] ?? 0) + v;
  }

  const chartData = months.map((month) => {
    const row: Record<string, string | number> = { month };
    const cell = byMonth.get(month) ?? {};
    for (const s of seriesLabels) {
      const dk = seriesDataKey(s);
      row[dk] = cell[dk] ?? 0;
    }
    return row;
  });

  return { chartData, seriesLabels, seriesKeys };
}

/** Pivot parent rows: one row per month, columns per primary category. */
export function pivotPcRows(
  rows: CategoryFlowParentRow[],
  metric: "debit" | "credit",
): PivotChartResult {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const parents = new Set<string>();
  for (const r of rows) parents.add(r.parent_category);
  let seriesLabels = [...parents].sort();
  if (seriesLabels.length > MAX_INSIGHTS_SERIES) {
    seriesLabels = seriesLabels.slice(0, MAX_INSIGHTS_SERIES);
  }
  const seriesKeys = seriesLabels.map(seriesDataKey);

  const byMonth = new Map<string, Record<string, number>>();
  for (const m of months) byMonth.set(m, {});

  for (const r of rows) {
    if (!seriesLabels.includes(r.parent_category)) continue;
    const cell = byMonth.get(r.month);
    if (!cell) continue;
    const dk = seriesDataKey(r.parent_category);
    const v = metric === "debit" ? r.debit_total : r.credit_total;
    cell[dk] = (cell[dk] ?? 0) + v;
  }

  const chartData = months.map((month) => {
    const row: Record<string, string | number> = { month };
    const cell = byMonth.get(month) ?? {};
    for (const s of seriesLabels) {
      const dk = seriesDataKey(s);
      row[dk] = cell[dk] ?? 0;
    }
    return row;
  });

  return { chartData, seriesLabels, seriesKeys };
}
