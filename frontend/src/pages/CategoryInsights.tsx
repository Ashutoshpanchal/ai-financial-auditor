import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { InsightsComparePanel } from "../components/insights/InsightsComparePanel";
import {
  api,
  fetchCategoryFlow,
  fetchCategoryFlowByParent,
  type CategoryFlowParentRow,
  type CategoryFlowRow,
  type FlowMode,
} from "../services/api";
import { CI_MONTH_DRAG_MIME, CI_YEAR_DRAG_MIME } from "../utils/insightsDrag";
import type { CompareAnchor } from "../utils/insightsCompareAnchor";
import { buildCompareRows } from "../utils/insightsMonthCompare";
import {
  dayBeforeMonth,
  mergeCategoryFlowRows,
  minMonth,
  monthStartMinusMonths,
  totalsFromRows,
} from "../utils/insightsMerge";
import { aggregateYearIntoRows } from "../utils/insightsYearAgg";

const ALL_PC_VALUE = "__all_pc__";

function mapParentApiToDisplayRows(rows: CategoryFlowParentRow[]): CategoryFlowRow[] {
  return rows.map((r) => ({
    parent_category: r.parent_category,
    month: r.month,
    sub_category: r.parent_category,
    debit_total: r.debit_total,
    credit_total: r.credit_total,
    txn_count: r.txn_count,
  }));
}

interface SubEntry {
  id: string;
  sub_category: string;
}

type MasterData = Record<string, SubEntry[]>;

interface MasterSplit {
  merged: MasterData;
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 36);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMonthLabel(ym: string): string {
  const parts = ym.split("-");
  if (parts.length !== 2) return ym;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "numeric" });
}

function formatDelta(n: number): string {
  const s = formatAmount(Math.abs(n));
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return formatAmount(0);
}

const MONTH_SECTION_PREFIX = "ci-month-";
const SCROLL_TOP_THRESHOLD = 80;
const PREPEND_MONTHS = 12;

export default function CategoryInsights() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [draftFrom, setDraftFrom] = useState(defaults.from);
  const [draftTo, setDraftTo] = useState(defaults.to);
  const [appliedFrom, setAppliedFrom] = useState(defaults.from);
  const [appliedTo, setAppliedTo] = useState(defaults.to);
  const [parentCategory, setParentCategory] = useState(ALL_PC_VALUE);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<FlowMode>("both");
  const [master, setMaster] = useState<MasterData>({});
  const [tableRows, setTableRows] = useState<CategoryFlowRow[]>([]);
  const [flowMeta, setFlowMeta] = useState<{
    truncated: boolean;
    truncated_reason?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<CompareAnchor | null>(null);
  const [compareB, setCompareB] = useState<CompareAnchor | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<MasterSplit>("/categories/master/split");
        if (!cancelled) setMaster(res.data.merged ?? {});
      } catch {
        if (!cancelled) setError("Could not load category list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parentOptions = useMemo(() => Object.keys(master).sort((a, b) => a.localeCompare(b)), [master]);

  const subOptions = useMemo(() => {
    if (!parentCategory) return [];
    return (master[parentCategory] ?? []).slice().sort((a, b) => a.sub_category.localeCompare(b.sub_category));
  }, [master, parentCategory]);

  const load = useCallback(async () => {
    const isAllPc = parentCategory === ALL_PC_VALUE;
    if (!isAllPc && !parentCategory.trim()) {
      setTableRows([]);
      setFlowMeta(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isAllPc) {
        const res = await fetchCategoryFlowByParent({
          dateFrom: appliedFrom,
          dateTo: appliedTo,
          mode,
        });
        setTableRows(mapParentApiToDisplayRows(res.rows));
        setFlowMeta({ truncated: res.truncated, truncated_reason: res.truncated_reason });
      } else {
        const subs = selectedSubs.size > 0 ? Array.from(selectedSubs) : undefined;
        const res = await fetchCategoryFlow({
          dateFrom: appliedFrom,
          dateTo: appliedTo,
          parentCategory: parentCategory.trim(),
          subCategories: subs,
          mode,
        });
        setTableRows(res.rows);
        setFlowMeta({ truncated: res.truncated, truncated_reason: res.truncated_reason });
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const d = ax.response?.data?.detail;
      setTableRows([]);
      setFlowMeta(null);
      setError(typeof d === "string" ? d : "Failed to load insights.");
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo, parentCategory, selectedSubs, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalsDisplay = useMemo(() => totalsFromRows(tableRows), [tableRows]);

  const rowsByMonth = useMemo(() => {
    if (!tableRows.length) return [];
    const map = new Map<string, CategoryFlowRow[]>();
    for (const row of tableRows) {
      const list = map.get(row.month) ?? [];
      list.push(row);
      map.set(row.month, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tableRows]);

  const rowsByYear = useMemo((): [string, [string, CategoryFlowRow[]][]][] => {
    if (!rowsByMonth.length) return [];
    const yMap = new Map<string, [string, CategoryFlowRow[]][]>();
    for (const entry of rowsByMonth) {
      const [month, rows] = entry;
      const year = month.slice(0, 4);
      const list = yMap.get(year) ?? [];
      list.push([month, rows]);
      yMap.set(year, list);
    }
    return Array.from(yMap.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [rowsByMonth]);

  const yearsInData = useMemo(() => rowsByYear.map(([y]) => y), [rowsByYear]);

  const monthKeysSet = useMemo(() => new Set(rowsByMonth.map(([ym]) => ym)), [rowsByMonth]);

  const yearKeysSet = useMemo(() => new Set(tableRows.map((r) => r.month.slice(0, 4))), [tableRows]);

  useEffect(() => {
    setCompareA((a) => {
      if (!a) return null;
      if (a.kind === "month") return monthKeysSet.has(a.ym) ? a : null;
      return yearKeysSet.has(a.year) ? a : null;
    });
    setCompareB((b) => {
      if (!b) return null;
      if (b.kind === "month") return monthKeysSet.has(b.ym) ? b : null;
      return yearKeysSet.has(b.year) ? b : null;
    });
  }, [monthKeysSet, yearKeysSet]);

  const compareRows = useMemo(() => {
    if (!compareA || !compareB) return null;
    const sliceFor = (anchor: CompareAnchor): CategoryFlowRow[] => {
      if (anchor.kind === "month") {
        return tableRows.filter((r) => r.month === anchor.ym);
      }
      return aggregateYearIntoRows(tableRows, anchor.year);
    };
    return buildCompareRows(sliceFor(compareA), sliceFor(compareB));
  }, [compareA, compareB, tableRows]);

  const isAllPc = parentCategory === ALL_PC_VALUE;

  const parentPcRowsForCompare = useMemo((): CategoryFlowParentRow[] | undefined => {
    if (!isAllPc) return undefined;
    return tableRows.map((r) => ({
      parent_category: r.parent_category,
      month: r.month,
      debit_total: r.debit_total,
      credit_total: r.credit_total,
      txn_count: r.txn_count,
    }));
  }, [isAllPc, tableRows]);

  const insightLevel = isAllPc ? "all_pc" : "pc_detail";

  function parseDroppedCompare(e: DragEvent): CompareAnchor | null {
    const ym = e.dataTransfer.getData(CI_MONTH_DRAG_MIME).trim();
    if (/^\d{4}-\d{2}$/.test(ym) && monthKeysSet.has(ym)) return { kind: "month", ym };
    const yr = e.dataTransfer.getData(CI_YEAR_DRAG_MIME).trim();
    if (/^\d{4}$/.test(yr) && yearKeysSet.has(yr)) return { kind: "year", year: yr };
    return null;
  }

  function onCompareSlotDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onCompareSlotDrop(e: DragEvent, slot: "a" | "b") {
    e.preventDefault();
    const anchor = parseDroppedCompare(e);
    if (!anchor) return;
    if (slot === "a") setCompareA(anchor);
    else setCompareB(anchor);
  }

  function onMonthDragStart(e: DragEvent, month: string) {
    if (!monthKeysSet.has(month)) return;
    e.dataTransfer.setData(CI_MONTH_DRAG_MIME, month);
    e.dataTransfer.effectAllowed = "copy";
    setDraggingKey(`m:${month}`);
  }

  function onYearDragStart(e: DragEvent, year: string) {
    if (!yearKeysSet.has(year)) return;
    e.dataTransfer.setData(CI_YEAR_DRAG_MIME, year);
    e.dataTransfer.effectAllowed = "copy";
    setDraggingKey(`y:${year}`);
  }

  function onCompareDragEnd() {
    setDraggingKey(null);
  }

  function setCompareSlot(slot: "a" | "b", value: CompareAnchor | null) {
    if (slot === "a") setCompareA(value);
    else setCompareB(value);
  }

  function handleApplyFilters() {
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
  }

  const loadOlderChunk = useCallback(async () => {
    if (loadingOlder || loading) return;
    const earliestYm = minMonth(tableRows);
    if (!earliestYm) return;
    const earliestStart = `${earliestYm}-01`;
    if (earliestStart <= appliedFrom) return;

    let chunkFrom = monthStartMinusMonths(earliestYm, PREPEND_MONTHS);
    const chunkEnd = dayBeforeMonth(earliestYm);
    if (chunkFrom < appliedFrom) chunkFrom = appliedFrom;
    if (chunkEnd < chunkFrom) return;

    const isAllPc = parentCategory === ALL_PC_VALUE;
    if (!isAllPc && !parentCategory.trim()) return;

    setLoadingOlder(true);
    try {
      if (isAllPc) {
        const res = await fetchCategoryFlowByParent({
          dateFrom: chunkFrom,
          dateTo: chunkEnd,
          mode,
        });
        setTableRows((prev) => mergeCategoryFlowRows(prev, mapParentApiToDisplayRows(res.rows)));
        setFlowMeta((m) => ({
          truncated: Boolean(m?.truncated || res.truncated),
          truncated_reason: res.truncated_reason ?? m?.truncated_reason,
        }));
      } else {
        const subs = selectedSubs.size > 0 ? Array.from(selectedSubs) : undefined;
        const res = await fetchCategoryFlow({
          dateFrom: chunkFrom,
          dateTo: chunkEnd,
          parentCategory: parentCategory.trim(),
          subCategories: subs,
          mode,
        });
        setTableRows((prev) => mergeCategoryFlowRows(prev, res.rows));
        setFlowMeta((m) => ({
          truncated: Boolean(m?.truncated || res.truncated),
          truncated_reason: res.truncated_reason ?? m?.truncated_reason,
        }));
      }
    } catch {
      /* ignore prepend errors */
    } finally {
      setLoadingOlder(false);
    }
  }, [parentCategory, loadingOlder, loading, tableRows, appliedFrom, selectedSubs, mode]);

  const onMainScroll = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el || loadingOlder || loading) return;
    if (el.scrollTop > SCROLL_TOP_THRESHOLD) return;
    void loadOlderChunk();
  }, [loadOlderChunk, loadingOlder, loading]);

  function scrollToMonth(month: string) {
    document.getElementById(`${MONTH_SECTION_PREFIX}${month}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActiveMonth(month);
  }

  function scrollToYear(year: string) {
    document.getElementById(`ci-year-${year}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveYear(year);
  }

  useEffect(() => {
    if (!rowsByMonth.length) {
      setActiveMonth(null);
      return;
    }
    setActiveMonth(rowsByMonth[0][0]);
  }, [rowsByMonth]);

  useEffect(() => {
    if (!rowsByMonth.length) return;
    const months = rowsByMonth.map(([m]) => m);
    const observers: IntersectionObserver[] = [];

    for (const month of months) {
      const el = document.getElementById(`${MONTH_SECTION_PREFIX}${month}`);
      if (!el) continue;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && e.intersectionRatio > 0.2) {
              setActiveMonth(month);
              setActiveYear(month.slice(0, 4));
              break;
            }
          }
        },
        { root: null, rootMargin: "-18% 0px -52% 0px", threshold: [0, 0.2, 0.4] },
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
  }, [rowsByMonth]);

  function toggleSub(sub: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  }

  function clearSubs() {
    setSelectedSubs(new Set());
  }

  return (
    <div className="flex max-h-[calc(100vh-4rem)] min-h-[calc(100vh-4rem)] w-full flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-5 lg:px-8">
        <div className="flex flex-wrap items-end gap-3 lg:gap-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-0.5 sm:w-36">
              <label htmlFor="ci-draft-from" className="text-xs font-medium text-gray-500">
                From
              </label>
              <input
                id="ci-draft-from"
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="min-w-0 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 sm:w-36">
              <label htmlFor="ci-draft-to" className="text-xs font-medium text-gray-500">
                To
              </label>
              <input
                id="ci-draft-to"
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="min-w-0 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:min-w-[10rem] sm:max-w-xs">
              <label htmlFor="ci-pc-top" className="text-xs font-medium text-gray-500">
                View
              </label>
              <select
                id="ci-pc-top"
                value={parentCategory}
                onChange={(e) => {
                  setParentCategory(e.target.value);
                  setSelectedSubs(new Set());
                }}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm"
              >
                <option value={ALL_PC_VALUE}>All primary categories</option>
                {parentOptions.map((p) => (
                  <option key={p} value={p}>
                    {capitalizeWords(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs font-medium text-gray-500">Flow</span>
              <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {(
                  [
                    ["both", "Both"],
                    ["debit", "Spending"],
                    ["credit", "Income"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                      mode === k ? "bg-white text-indigo-600 shadow-sm" : "text-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleApplyFilters}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        {parentCategory && parentCategory !== ALL_PC_VALUE ? (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Sub-categories (optional)</span>
              <button type="button" onClick={clearSubs} className="text-xs text-indigo-600 hover:text-indigo-800">
                Clear
              </button>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
              {subOptions.length === 0 ? (
                <span className="text-xs text-gray-500">No sub-categories for this parent.</span>
              ) : (
                subOptions.map((s) => (
                  <label
                    key={s.id}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white bg-white px-2 py-1 text-xs text-gray-700 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubs.has(s.sub_category)}
                      onChange={() => toggleSub(s.sub_category)}
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    {capitalizeWords(s.sub_category)}
                  </label>
                ))
              )}
            </div>
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden xl:flex-row">
        <main
          ref={mainScrollRef}
          onScroll={onMainScroll}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-6 xl:py-5"
        >
          <div className="mb-4 max-w-4xl">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Category insights</h1>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              Default shows all primary categories (PC). Pick one primary to drill into sub-categories (SC). Scroll up
              to load older data. Drag a <strong>month</strong> or <strong>year</strong> into compare slots on the
              right, or use A / B.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-gray-600">
              {isAllPc ? (
                <span className="font-medium text-gray-900">All primary categories</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="font-medium text-indigo-600 hover:underline"
                    onClick={() => {
                      setParentCategory(ALL_PC_VALUE);
                      setSelectedSubs(new Set());
                    }}
                  >
                    All primary categories
                  </button>
                  <span className="text-gray-400">›</span>
                  <span className="font-medium text-gray-900">{capitalizeWords(parentCategory)}</span>
                </>
              )}
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : null}

          {loadingOlder ? (
            <div className="mb-2 rounded-md bg-indigo-50 px-3 py-2 text-center text-xs text-indigo-700">
              Loading older months…
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {flowMeta?.truncated && flowMeta.truncated_reason ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {flowMeta.truncated_reason}
                </div>
              ) : null}
              <div className="mb-8 flex flex-wrap gap-8 text-sm">
                <div>
                  <span className="text-gray-500">Total debit (loaded)</span>
                  <div className="font-semibold tabular-nums text-gray-900">{formatAmount(totalsDisplay.debit)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Total credit (loaded)</span>
                  <div className="font-semibold tabular-nums text-gray-900">{formatAmount(totalsDisplay.credit)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Transactions</span>
                  <div className="font-semibold tabular-nums text-gray-900">{totalsDisplay.txn_count}</div>
                </div>
              </div>

              {tableRows.length === 0 ? (
                <p className="text-sm text-gray-500">No rows in this range.</p>
              ) : (
                <div className="flex gap-3 lg:gap-4">
                  <nav
                    aria-label="Years"
                    className="sticky top-2 hidden w-[4.5rem] shrink-0 self-start sm:block"
                  >
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">Year</p>
                    <ul className="flex flex-col gap-1 border-l-2 border-indigo-100 pl-2">
                      {yearsInData.map((year) => {
                        const isActive = activeYear === year;
                        return (
                          <li key={year} className="relative">
                            <span
                              className="absolute -left-[5px] top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full border border-white bg-indigo-400 sm:block"
                              aria-hidden
                            />
                            <div className="flex w-full items-stretch gap-0.5">
                              <div
                                role="button"
                                tabIndex={0}
                                draggable
                                title="Drag year to compare"
                                aria-label={`Year ${year} — drag to compare`}
                                onDragStart={(e) => onYearDragStart(e, year)}
                                onDragEnd={onCompareDragEnd}
                                onClick={() => scrollToYear(year)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    scrollToYear(year);
                                  }
                                }}
                                className={`min-w-0 flex-1 cursor-grab rounded px-1 py-0.5 text-left text-[11px] font-semibold tabular-nums transition-colors active:cursor-grabbing ${
                                  isActive ? "bg-indigo-50 text-indigo-800" : "text-gray-500 hover:bg-gray-100"
                                } ${draggingKey === `y:${year}` ? "opacity-60" : ""}`}
                              >
                                {year}
                              </div>
                              <div
                                className="flex shrink-0 flex-col justify-center gap-0.5"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  title="Compare slot A (year)"
                                  onClick={() => setCompareA({ kind: "year", year })}
                                  className="rounded border border-gray-200/80 bg-white px-1 py-0.5 text-[9px] font-bold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50"
                                >
                                  A
                                </button>
                                <button
                                  type="button"
                                  title="Compare slot B (year)"
                                  onClick={() => setCompareB({ kind: "year", year })}
                                  className="rounded border border-gray-200/80 bg-white px-1 py-0.5 text-[9px] font-bold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50"
                                >
                                  B
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </nav>

                  <div className="min-w-0 flex-1 space-y-6 pb-8">
                    {rowsByYear.map(([year, months]) => (
                      <section
                        key={year}
                        id={`ci-year-${year}`}
                        aria-labelledby={`ci-year-h-${year}`}
                        className="scroll-mt-28"
                      >
                        <div className="mb-3 flex flex-col gap-1 border-b border-gray-200 pb-2 sm:flex-row sm:items-end sm:justify-between">
                          <h2
                            id={`ci-year-h-${year}`}
                            className="text-2xl font-extrabold tracking-tight text-gray-200 tabular-nums sm:text-3xl"
                          >
                            {year}
                          </h2>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                            {months.length} month{months.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                          <aside className="lg:w-48 lg:shrink-0 lg:sticky lg:top-2 lg:self-start">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Months</p>
                            <nav
                              aria-label={`Months in ${year}`}
                              className="flex flex-row flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap lg:gap-0 lg:relative lg:ml-2 lg:border-l-2 lg:border-indigo-200 lg:pl-5 lg:pb-1"
                            >
                              {months.map(([month]) => {
                                const isActive = activeMonth === month;
                                return (
                                  <div key={month} className="relative flex w-full items-stretch gap-1 lg:py-2 lg:first:pt-0">
                                    <span
                                      className={`absolute -left-[1px] top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow lg:block ${
                                        isActive
                                          ? "h-3.5 w-3.5 bg-indigo-700 ring-4 ring-indigo-100"
                                          : "h-3 w-3 bg-indigo-500 ring-2 ring-indigo-50"
                                      }`}
                                      aria-hidden
                                    />
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      draggable
                                      title="Drag to compare (right panel)"
                                      aria-label={`${formatMonthLabel(month)} — drag to compare or press Enter to scroll`}
                                      onDragStart={(e) => onMonthDragStart(e, month)}
                                      onDragEnd={onCompareDragEnd}
                                      onClick={() => scrollToMonth(month)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          scrollToMonth(month);
                                        }
                                      }}
                                      className={`relative flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm transition-colors active:cursor-grabbing lg:pl-1 ${
                                        isActive
                                          ? "border-indigo-200 bg-indigo-50 font-medium text-indigo-800 ring-1 ring-indigo-100"
                                          : "text-gray-700 hover:border-gray-200 hover:bg-gray-100"
                                      } ${draggingKey === `m:${month}` ? "opacity-60" : ""}`}
                                    >
                                      <span
                                        className={`h-2 w-2 shrink-0 rounded-full lg:hidden ${
                                          isActive ? "bg-indigo-700" : "bg-indigo-400"
                                        }`}
                                        aria-hidden
                                      />
                                      <span className="tabular-nums">{formatMonthLabel(month)}</span>
                                    </div>
                                    <div
                                      className="flex shrink-0 flex-col justify-center gap-0.5 py-0.5"
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        title="Set as compare slot A"
                                        onClick={() => setCompareA({ kind: "month", ym: month })}
                                        className="rounded border border-gray-200/80 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                                      >
                                        A
                                      </button>
                                      <button
                                        type="button"
                                        title="Set as compare slot B"
                                        onClick={() => setCompareB({ kind: "month", ym: month })}
                                        className="rounded border border-gray-200/80 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                                      >
                                        B
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </nav>
                          </aside>

                          <div className="min-w-0 flex-1 space-y-4">
                            {months.map(([month, rows]) => (
                              <section
                                key={month}
                                id={`${MONTH_SECTION_PREFIX}${month}`}
                                className="scroll-mt-28"
                              >
                                <div className="flex gap-2">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    draggable
                                    title="Drag to compare (right panel) — click to scroll here"
                                    aria-label={`${formatMonthLabel(month)} — drag to compare`}
                                    onDragStart={(e) => onMonthDragStart(e, month)}
                                    onDragEnd={onCompareDragEnd}
                                    onClick={() => scrollToMonth(month)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        scrollToMonth(month);
                                      }
                                    }}
                                    className={`min-w-0 flex-1 cursor-grab rounded-xl border border-gray-200 bg-white shadow-sm transition-colors active:cursor-grabbing hover:border-indigo-300 hover:shadow ${
                                      draggingKey === `m:${month}` ? "opacity-70 ring-2 ring-indigo-200" : ""
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-2 py-1.5">
                                      <h3 className="text-xs font-semibold tracking-wide text-indigo-700 tabular-nums sm:text-sm">
                                        {formatMonthLabel(month)}{" "}
                                        <span className="font-normal text-gray-400">({month})</span>
                                      </h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full text-xs">
                                        <thead>
                                          <tr className="bg-gray-50 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                            <th className="px-2 py-2">{isAllPc ? "Primary" : "Sub-category"}</th>
                                            <th className="px-2 py-2 text-right">Debit</th>
                                            <th className="px-2 py-2 text-right">Credit</th>
                                            <th className="px-2 py-2 text-right">Count</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {rows.map((row) => (
                                            <tr
                                              key={`${month}-${row.sub_category}`}
                                              className="border-t border-gray-100 hover:bg-gray-50"
                                            >
                                              <td className="px-2 py-1.5 text-gray-900">
                                                {capitalizeWords(row.sub_category)}
                                              </td>
                                              <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                                                {formatAmount(row.debit_total)}
                                              </td>
                                              <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                                                {formatAmount(row.credit_total)}
                                              </td>
                                              <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                                                {row.txn_count}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  <div
                                    className="flex shrink-0 flex-col justify-start gap-1 pt-1"
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      title="Set as compare slot A"
                                      onClick={() => setCompareA({ kind: "month", ym: month })}
                                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                                    >
                                      A
                                    </button>
                                    <button
                                      type="button"
                                      title="Set as compare slot B"
                                      onClick={() => setCompareB({ kind: "month", ym: month })}
                                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                                    >
                                      B
                                    </button>
                                  </div>
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-gray-200 bg-white xl:max-h-none xl:min-h-0 xl:min-w-[min(42vw,36rem)] xl:max-w-[40rem] xl:flex-[1.15] xl:border-b-0 xl:border-l xl:border-gray-200">
          <InsightsComparePanel
            appliedFrom={appliedFrom}
            appliedTo={appliedTo}
            mode={mode}
            insightLevel={insightLevel}
            parentPcRowsForCompare={parentPcRowsForCompare}
            compareA={compareA}
            compareB={compareB}
            compareRows={compareRows}
            draggingKey={draggingKey}
            onCompareSlotDragOver={onCompareSlotDragOver}
            onCompareSlotDrop={onCompareSlotDrop}
            onSetCompareSlot={setCompareSlot}
            formatMonthLabel={formatMonthLabel}
            formatAmount={formatAmount}
            formatDelta={formatDelta}
            capitalizeWords={capitalizeWords}
            hasMonthData={tableRows.length > 0}
          />
        </aside>
      </div>
    </div>
  );
}
