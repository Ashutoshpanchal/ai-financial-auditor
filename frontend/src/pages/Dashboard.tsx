import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, FilterState } from "../components/dashboard/FilterBar";
import { useTransactionDateScope } from "../hooks/useTransactionDateScope";
import { WidgetGrid } from "../components/dashboard/WidgetGrid";
import { useAuth } from "../hooks/useAuth";

const API = "http://localhost:8000";

interface Widget {
  id: string;
  title: string;
  widget_type: "metric" | "bar_chart" | "pie_chart" | "line_chart";
  query_config: Record<string, unknown>;
  is_default: boolean;
}

interface GridItem {
  widget_id: string;
  row: number;
  col: number;
  col_span: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function formatFilterDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" });
}

function buildFilterSummary(filters: FilterState, userName?: string | null): string {
  const parts: string[] = [];
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? formatFilterDate(filters.dateFrom) : "…";
    const to = filters.dateTo ? formatFilterDate(filters.dateTo) : "…";
    parts.push(`${from} – ${to}`);
  }
  if (filters.bankName) parts.push(filters.bankName);
  if (userName) parts.push(userName);
  return parts.length > 0 ? parts.join(" · ") : "All transactions";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [grid, setGrid] = useState<GridItem[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    bankName: "",
    parentCategory: "",
    subCategories: [],
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoadingLayout, setIsLoadingLayout] = useState(true);
  const {
    scope: dateScope,
    defaultRange,
    loading: dateScopeLoading,
    bankNames,
    categoryMaster,
  } = useTransactionDateScope();
  const datesInitialized = useRef(false);

  const parentCategoryOptions = useMemo(
    () => Object.keys(categoryMaster).sort((a, b) => a.localeCompare(b)),
    [categoryMaster],
  );

  const subCategoryOptions = useMemo(() => {
    if (!filters.parentCategory) return [];
    const subs = categoryMaster[filters.parentCategory] ?? [];
    return subs.map((s) => s.sub_category).sort((a, b) => a.localeCompare(b));
  }, [categoryMaster, filters.parentCategory]);

  const filterSummary = useMemo(
    () => buildFilterSummary(filters, user?.name),
    [filters, user?.name],
  );

  useEffect(() => {
    if (datesInitialized.current || dateScopeLoading || !defaultRange) return;
    if (!filters.dateFrom && !filters.dateTo) {
      datesInitialized.current = true;
      setFilters((prev) => ({
        ...prev,
        dateFrom: defaultRange.from,
        dateTo: defaultRange.to,
      }));
    }
  }, [dateScopeLoading, defaultRange, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    const load = async () => {
      try {
        const [widgetList, layout] = await Promise.all([
          apiFetch<Widget[]>("/dashboard/widgets"),
          apiFetch<{ cols: number; grid: GridItem[] }>("/dashboard/layout"),
        ]);
        setWidgets(widgetList);
        setGrid(layout.grid ?? []);
      } catch {
        // silently handle — widget grid shows empty state
      } finally {
        setIsLoadingLayout(false);
      }
    };
    void load();
  }, []);

  const saveLayout = useCallback(async (newGrid: GridItem[]) => {
    try {
      await apiFetch("/dashboard/layout", {
        method: "PUT",
        body: JSON.stringify({ layout: { cols: 3, grid: newGrid } }),
      });
    } catch {
      // best-effort save
    }
  }, []);

  const handleGridChange = useCallback(
    (newGrid: GridItem[]) => {
      setGrid(newGrid);
      void saveLayout(newGrid);
    },
    [saveLayout],
  );

  const handleRemoveFromGrid = useCallback(
    (widgetId: string) => {
      const newGrid = grid.filter((g) => g.widget_id !== widgetId);
      setGrid(newGrid);
      void saveLayout(newGrid);
    },
    [grid, saveLayout],
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Spending overview</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{filterSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditMode((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              isEditMode
                ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 dark:border-gray-500"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {isEditMode ? "Done" : "Edit"}
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        bankOptions={bankNames}
        parentCategoryOptions={parentCategoryOptions}
        subCategoryOptions={subCategoryOptions}
        dateScope={dateScope}
        dateScopeLoading={dateScopeLoading}
        defaultDateRange={defaultRange}
      />

      <main className="mx-auto max-w-7xl p-4 sm:px-6 lg:px-8">
        {isLoadingLayout ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              />
            ))}
          </div>
        ) : (
          <WidgetGrid
            widgets={widgets}
            grid={grid}
            filters={filters}
            isEditMode={isEditMode}
            onGridChange={handleGridChange}
            onRemove={handleRemoveFromGrid}
          />
        )}
      </main>
    </div>
  );
}
