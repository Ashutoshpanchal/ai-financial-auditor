import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchCategoryFlowByParentPaginated,
  type CategoryFlowParentRow,
  type FlowMode,
} from "../../services/api";
import { formatCompareAnchorLabel, type CompareAnchor } from "../../utils/insightsCompareAnchor";
import type { CompareRow } from "../../utils/insightsMonthCompare";
import {
  buildCompareChartData,
  buildCompareKeyedFromParentAnchors,
  compareScRowsToKeyed,
  MAX_COMPARE_SERIES_POINTS,
} from "../../utils/insightsCompareChart";

const SERIES_COLORS = { mA: "#6366f1", mB: "#10b981" };

function formatCountDelta(d: number): string {
  if (d === 0) return "0";
  if (d > 0) return `+${d}`;
  return String(d);
}

function anchorToChartYm(a: CompareAnchor): string {
  return a.kind === "month" ? a.ym : `${a.year}-01`;
}

export interface InsightsComparePanelProps {
  appliedFrom: string;
  appliedTo: string;
  mode: FlowMode;
  insightLevel: "all_pc" | "pc_detail";
  /** When set (including `[]`), PC compare uses these rows and skips a network fetch. */
  parentPcRowsForCompare?: CategoryFlowParentRow[];
  compareA: CompareAnchor | null;
  compareB: CompareAnchor | null;
  compareRows: CompareRow[] | null;
  draggingKey: string | null;
  onCompareSlotDragOver: (e: DragEvent) => void;
  onCompareSlotDrop: (e: DragEvent, slot: "a" | "b") => void;
  onSetCompareSlot: (slot: "a" | "b", value: CompareAnchor | null) => void;
  formatMonthLabel: (ym: string) => string;
  formatAmount: (n: number) => string;
  formatDelta: (n: number) => string;
  capitalizeWords: (s: string) => string;
  hasMonthData: boolean;
}

export function InsightsComparePanel({
  appliedFrom,
  appliedTo,
  mode,
  insightLevel,
  parentPcRowsForCompare,
  compareA,
  compareB,
  compareRows,
  draggingKey,
  onCompareSlotDragOver,
  onCompareSlotDrop,
  onSetCompareSlot,
  formatMonthLabel,
  formatAmount,
  formatDelta,
  capitalizeWords,
  hasMonthData,
}: InsightsComparePanelProps) {
  const [viewMode, setViewMode] = useState<"sc" | "pc">("pc");
  const [xGranularity, setXGranularity] = useState<"series" | "month" | "year">("series");
  const [yMetric, setYMetric] = useState<"debit" | "credit" | "count">("debit");
  const [chartKind, setChartKind] = useState<"bar" | "line">("bar");
  const [pcFlowRows, setPcFlowRows] = useState<CategoryFlowParentRow[] | null>(null);
  const [pcLoading, setPcLoading] = useState(false);
  const [pcError, setPcError] = useState<string | null>(null);

  const useParentPc = insightLevel === "all_pc";

  useEffect(() => {
    if (useParentPc) {
      setViewMode("pc");
    } else {
      setViewMode("sc");
    }
  }, [useParentPc]);

  useEffect(() => {
    if (viewMode !== "pc") {
      return;
    }
    if (useParentPc && parentPcRowsForCompare !== undefined) {
      setPcFlowRows(parentPcRowsForCompare);
      setPcLoading(false);
      setPcError(null);
      return;
    }
    let cancelled = false;
    setPcError(null);
    setPcLoading(true);
    setPcFlowRows(null);
    (async () => {
      try {
        const allRows: CategoryFlowParentRow[] = [];
        let monthCursor: string | null = null;
        let hasMore = true;

        // Fetch all pages
        while (hasMore && !cancelled) {
          const res = await fetchCategoryFlowByParentPaginated({
            dateFrom: appliedFrom,
            dateTo: appliedTo,
            mode,
            monthCursor: monthCursor ?? undefined,
            limit: 100,
          });
          allRows.push(...res.rows);
          monthCursor = res.pagination.next_cursor;
          hasMore = res.pagination.has_more;
        }

        if (!cancelled) setPcFlowRows(allRows);
      } catch {
        if (!cancelled) {
          setPcError("Could not load primary-category (PC) totals.");
          setPcFlowRows([]);
        }
      } finally {
        if (!cancelled) setPcLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, useParentPc, parentPcRowsForCompare, appliedFrom, appliedTo, mode]);

  const labelA = compareA ? formatCompareAnchorLabel(compareA, formatMonthLabel) : "Slot A";
  const labelB = compareB ? formatCompareAnchorLabel(compareB, formatMonthLabel) : "Slot B";
  const chartYmA = compareA ? anchorToChartYm(compareA) : "";
  const chartYmB = compareB ? anchorToChartYm(compareB) : "";

  const effectivePcRows = useMemo((): CategoryFlowParentRow[] => {
    if (useParentPc && parentPcRowsForCompare !== undefined) return parentPcRowsForCompare;
    return pcFlowRows ?? [];
  }, [useParentPc, parentPcRowsForCompare, pcFlowRows]);

  const compareKeyed = useMemo(() => {
    if (!compareA || !compareB) return null;
    if (viewMode === "sc") {
      if (compareRows === null) return null;
      return compareScRowsToKeyed(compareRows);
    }
    if (!effectivePcRows.length) return null;
    return buildCompareKeyedFromParentAnchors(effectivePcRows, compareA, compareB);
  }, [viewMode, compareRows, compareA, compareB, effectivePcRows]);

  const chartPayload = useMemo(() => {
    if (!compareA || !compareB || compareKeyed === null) return null;
    return buildCompareChartData(
      compareKeyed,
      chartYmA,
      chartYmB,
      xGranularity,
      yMetric,
      labelA,
      labelB,
      capitalizeWords,
    );
  }, [
    compareKeyed,
    compareA,
    compareB,
    chartYmA,
    chartYmB,
    xGranularity,
    yMetric,
    labelA,
    labelB,
    capitalizeWords,
  ]);

  const yAxisTitle =
    yMetric === "debit" ? "Debit" : yMetric === "credit" ? "Credit" : "Transaction count";

  const seriesXLabel = viewMode === "sc" ? "Sub-category (SC)" : "Primary category (PC)";
  const xAxisTitle =
    xGranularity === "series" ? seriesXLabel : xGranularity === "month" ? "Period" : "Year (calendar)";

  const axisDisabled = !compareA || !compareB;

  const angledX = xGranularity === "series" && (chartPayload?.chartData.length ?? 0) > 4;

  const chartShared = {
    data: chartPayload?.chartData ?? [],
    margin: { top: 8, right: 8, left: 0, bottom: 4 } as const,
    xAxisProps: {
      dataKey: "name" as const,
      tick: { fontSize: 9, fill: "#6b7280" },
      interval: 0 as const,
      angle: angledX ? -32 : 0,
      textAnchor: (angledX ? "end" : "middle") as "end" | "middle",
      height: angledX ? 68 : 32,
      axisLine: false,
      tickLine: false,
    },
    yAxisProps: {
      tick: { fontSize: 9, fill: "#6b7280" },
      width: 44,
      axisLine: false,
      tickLine: false,
    },
    tooltipProps: {
      formatter: (v: number | string) => {
        const n = typeof v === "number" ? v : Number(v);
        return yMetric === "count" ? String(Math.round(n)) : formatAmount(n);
      },
      contentStyle: { fontSize: 11, borderRadius: 8 },
    },
  };

  const showChartBlock = Boolean(compareA && compareB && compareKeyed !== null && chartPayload);

  const firstColLabel = viewMode === "sc" ? "SC" : "PC";

  const slotHighlight = Boolean(draggingKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white">
      <div className="shrink-0 px-3 py-3 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-indigo-900">Compare</h2>
          <span className="max-w-[14rem] text-right text-[10px] text-indigo-700/80">
            Drag a month or year from the left into a slot (or use A / B).
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-3">
          {(
            [
              ["a", "Slot A", compareA] as const,
              ["b", "Slot B", compareB] as const,
            ] as const
          ).map(([slot, slotLabel, val]) => (
            <div
              key={slot}
              onDragOver={onCompareSlotDragOver}
              onDrop={(e) => onCompareSlotDrop(e, slot)}
              className={`flex min-h-[4rem] min-w-[min(100%,8.5rem)] flex-1 flex-col rounded-xl border-2 border-dashed px-3 py-2 shadow-sm transition-colors ${
                slotHighlight ? "border-indigo-500 bg-white ring-1 ring-indigo-200" : "border-indigo-200/90 bg-white/95"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">{slotLabel}</span>
                {val ? (
                  <button
                    type="button"
                    onClick={() => onSetCompareSlot(slot, null)}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-900"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <p className="mt-1 flex-1 text-sm font-semibold leading-snug text-gray-900">
                {val ? (
                  formatCompareAnchorLabel(val, formatMonthLabel)
                ) : (
                  <span className="font-normal text-gray-400">Drop month or year</span>
                )}
              </p>
            </div>
          ))}
        </div>

        {useParentPc ? (
          <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2 py-2">
            <p className="text-[10px] font-medium text-indigo-900">
              Left: all primary categories — compare level is <span className="font-semibold">PC</span> only.
            </p>
          </div>
        ) : (
          <div className="mb-3">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Level</span>
            <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
              {(
                [
                  ["sc", "SC"],
                  ["pc", "PC"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setViewMode(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    viewMode === k ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
              SC matches the primary category on the left. PC loads all primaries for the applied range.
            </p>
          </div>
        )}

        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">X axis</span>
            <select
              value={xGranularity}
              onChange={(e) => setXGranularity(e.target.value as "series" | "month" | "year")}
              disabled={axisDisabled}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-50"
            >
              <option value="series">{viewMode === "sc" ? "Sub-category (SC)" : "Primary (PC)"}</option>
              <option value="month">Month / period</option>
              <option value="year">Year</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Y axis</span>
            <select
              value={yMetric}
              onChange={(e) => setYMetric(e.target.value as "debit" | "credit" | "count")}
              disabled={axisDisabled}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-50"
            >
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
              <option value="count">Transaction count</option>
            </select>
          </label>
        </div>

        <div className="mb-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Chart</span>
          <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
            {(
              [
                ["bar", "Bar"],
                ["line", "Line"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                disabled={axisDisabled}
                onClick={() => setChartKind(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  chartKind === k ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-500">
          {xAxisTitle} vs {yAxisTitle}. Series view: top {MAX_COMPARE_SERIES_POINTS}{" "}
          {viewMode === "sc" ? "sub-categories" : "primary categories"} by combined amount.
        </p>
        {pcError ? <p className="mt-1 text-[10px] text-red-600">{pcError}</p> : null}
      </div>

      {viewMode === "pc" && pcLoading && !useParentPc ? (
        <div className="flex flex-1 items-center justify-center py-12 text-xs text-gray-500">Loading PC data…</div>
      ) : showChartBlock ? (
        <>
          <div className="min-h-[200px] flex-1 min-w-0 px-3 pb-2 sm:px-4">
            <div className="h-full min-h-[200px] w-full rounded-lg border border-gray-200 bg-white p-1">
              <ResponsiveContainer width="100%" height="100%">
                {chartKind === "line" ? (
                  <LineChart data={chartShared.data} margin={chartShared.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis {...chartShared.xAxisProps} />
                    <YAxis {...chartShared.yAxisProps} />
                    <Tooltip {...chartShared.tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="mA"
                      name={labelA}
                      stroke={SERIES_COLORS.mA}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="mB"
                      name={labelB}
                      stroke={SERIES_COLORS.mB}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={chartShared.data} margin={chartShared.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis {...chartShared.xAxisProps} />
                    <YAxis {...chartShared.yAxisProps} />
                    <Tooltip {...chartShared.tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar
                      dataKey="mA"
                      name={labelA}
                      fill={SERIES_COLORS.mA}
                      radius={[2, 2, 0, 0]}
                      maxBarSize={44}
                    />
                    <Bar
                      dataKey="mB"
                      name={labelB}
                      fill={SERIES_COLORS.mB}
                      radius={[2, 2, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="max-h-[min(40vh,240px)] shrink-0 overflow-auto border-t border-gray-100 px-3 pb-3 sm:px-4">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-sm">
              <table className="min-w-full">
                <thead className="sticky top-0 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">{firstColLabel}</th>
                    <th className="px-2 py-2 text-right">{labelA}</th>
                    <th className="px-2 py-2 text-right">{labelB}</th>
                    <th className="px-2 py-2 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {compareKeyed!.map(({ key, a, b }) => {
                    const da =
                      yMetric === "debit"
                        ? (a?.debit_total ?? 0)
                        : yMetric === "credit"
                          ? (a?.credit_total ?? 0)
                          : (a?.txn_count ?? 0);
                    const db =
                      yMetric === "debit"
                        ? (b?.debit_total ?? 0)
                        : yMetric === "credit"
                          ? (b?.credit_total ?? 0)
                          : (b?.txn_count ?? 0);
                    const fmt = (n: number) => (yMetric === "count" ? String(n) : formatAmount(n));
                    return (
                      <tr key={key} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="max-w-[7rem] truncate px-2 py-1.5 text-gray-800">
                          {capitalizeWords(key)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{fmt(da)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{fmt(db)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                          {yMetric === "count" ? formatCountDelta(db - da) : formatDelta(db - da)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-3 py-8 sm:px-4">
          <div className="w-full rounded-lg border border-dashed border-gray-200 bg-white/60 py-8 text-center text-xs text-gray-400">
            {!hasMonthData
              ? "Apply filters and load data on the left, then pick two months or years."
              : !compareA || !compareB
                ? "Choose two periods (drag month/year or use A / B)."
                : "Loading…"}
          </div>
        </div>
      )}
    </div>
  );
}
