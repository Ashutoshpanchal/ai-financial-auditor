import type { CategoryFlowParentRow, CategoryFlowRow } from "../services/api";
import type { CompareAnchor } from "./insightsCompareAnchor";
import type { CompareRow } from "./insightsMonthCompare";

export type CompareXGranularity = "series" | "month" | "year";
export type CompareYMetric = "debit" | "credit" | "count";

const MAX_SERIES_POINTS = 28;

export const MAX_COMPARE_SERIES_POINTS = MAX_SERIES_POINTS;

export type MetricSlice = Pick<CategoryFlowRow, "debit_total" | "credit_total" | "txn_count">;

/** Unified row for compare chart/table (SC = sub-category key, PC = parent_category key). */
export interface CompareKeyedRow {
  key: string;
  a: MetricSlice | null;
  b: MetricSlice | null;
}

export function compareScRowsToKeyed(rows: CompareRow[]): CompareKeyedRow[] {
  return rows.map((r) => ({
    key: r.sub_category,
    a: r.a,
    b: r.b,
  }));
}

function toMetricSlice(r: CategoryFlowParentRow): MetricSlice {
  return {
    debit_total: r.debit_total,
    credit_total: r.credit_total,
    txn_count: r.txn_count,
  };
}

function parentYearTotals(rows: CategoryFlowParentRow[], year: string): Map<string, MetricSlice> {
  const m = new Map<string, MetricSlice>();
  for (const r of rows) {
    if (!r.month.startsWith(year)) continue;
    const pk = r.parent_category;
    const prev = m.get(pk);
    if (!prev) {
      m.set(pk, toMetricSlice(r));
    } else {
      m.set(pk, {
        debit_total: prev.debit_total + r.debit_total,
        credit_total: prev.credit_total + r.credit_total,
        txn_count: prev.txn_count + r.txn_count,
      });
    }
  }
  return m;
}

function parentAnchorSlice(
  rows: CategoryFlowParentRow[],
  anchor: CompareAnchor,
): Map<string, MetricSlice> {
  if (anchor.kind === "month") {
    const slice = rows.filter((r) => r.month === anchor.ym);
    return new Map(slice.map((r) => [r.parent_category, toMetricSlice(r)]));
  }
  return parentYearTotals(rows, anchor.year);
}

/** PC compare for arbitrary month/year anchor pairs (uses same `a` / `b` slot order). */
export function buildCompareKeyedFromParentAnchors(
  allParentRows: CategoryFlowParentRow[],
  anchorA: CompareAnchor,
  anchorB: CompareAnchor,
): CompareKeyedRow[] {
  const mapA = parentAnchorSlice(allParentRows, anchorA);
  const mapB = parentAnchorSlice(allParentRows, anchorB);
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  return [...keys]
    .sort((x, y) => x.localeCompare(y))
    .map((key) => ({
      key,
      a: mapA.get(key) ?? null,
      b: mapB.get(key) ?? null,
    }));
}

function metricValue(row: MetricSlice | null, m: CompareYMetric): number {
  if (!row) return 0;
  if (m === "debit") return row.debit_total;
  if (m === "credit") return row.credit_total;
  return row.txn_count;
}

export function buildCompareChartData(
  compareKeyed: CompareKeyedRow[],
  compareMonthA: string,
  compareMonthB: string,
  xGranularity: CompareXGranularity,
  yMetric: CompareYMetric,
  monthLabelA: string,
  monthLabelB: string,
  formatCategoryLabel: (raw: string) => string,
): { chartData: Record<string, string | number>[] } {
  const ta = compareKeyed.reduce((s, r) => s + metricValue(r.a, yMetric), 0);
  const tb = compareKeyed.reduce((s, r) => s + metricValue(r.b, yMetric), 0);

  if (xGranularity === "month") {
    return {
      chartData: [
        { name: monthLabelA, mA: ta, mB: 0 },
        { name: monthLabelB, mA: 0, mB: tb },
      ],
    };
  }

  if (xGranularity === "year") {
    const ya = compareMonthA.slice(0, 4);
    const yb = compareMonthB.slice(0, 4);
    if (ya === yb) {
      return { chartData: [{ name: ya, mA: ta, mB: tb }] };
    }
    return {
      chartData: [
        { name: ya, mA: ta, mB: 0 },
        { name: yb, mA: 0, mB: tb },
      ],
    };
  }

  const scored = compareKeyed.map((r) => {
    const va = metricValue(r.a, yMetric);
    const vb = metricValue(r.b, yMetric);
    return { r, score: va + vb };
  });
  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, MAX_SERIES_POINTS);

  return {
    chartData: top.map(({ r }) => {
      const raw = r.key.length > 22 ? `${r.key.slice(0, 20)}…` : r.key;
      return {
        name: formatCategoryLabel(raw),
        mA: metricValue(r.a, yMetric),
        mB: metricValue(r.b, yMetric),
      };
    }),
  };
}
