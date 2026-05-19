import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardOverview } from "../components/dashboard/cards/DashboardOverview";
import { FilterBar, FilterState } from "../components/dashboard/FilterBar";
import { useDashboardOverview } from "../hooks/useDashboardOverview";
import { useTransactionDateScope } from "../hooks/useTransactionDateScope";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../contexts/ThemeContext";
import "../styles/dashboard-editorial.css";

function formatFilterDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" });
}

function buildPeriodLabel(filters: FilterState): string {
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? formatFilterDate(filters.dateFrom) : "…";
    const to = filters.dateTo ? formatFilterDate(filters.dateTo) : "…";
    return `${from} – ${to}`;
  }
  return "All transactions";
}

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDarkEditorial = theme === "dark";
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    bankNames: [],
    parentCategory: "",
    subCategories: [],
  });
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

  const periodLabel = useMemo(() => buildPeriodLabel(filters), [filters]);
  const { data, isLoading, error } = useDashboardOverview(filters);

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

  const headerBank =
    filters.bankNames[0] ?? (bankNames.length === 1 ? bankNames[0] : null);

  return (
    <div
      className={
        isDarkEditorial
          ? "dashboard-editorial"
          : "dashboard-editorial dashboard-editorial--light"
      }
    >
      <div className="de-glow-1" aria-hidden />
      <div className="de-glow-2" aria-hidden />

      <header className="relative z-10 border-b border-[var(--border2)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1120px]">
          {headerBank && (
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "var(--lime)" }}
            >
              {headerBank}
            </p>
          )}
          <h1
            className="font-display text-5xl tracking-wide sm:text-6xl"
            style={{ fontFamily: "var(--font-display)", lineHeight: 0.9 }}
          >
            SPENDING <span style={{ color: "var(--lime)" }}>OVERVIEW</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--t3)" }}>
            {user?.name ?? "Your account"}
            {periodLabel !== "All transactions" ? ` · ${periodLabel}` : ""}
          </p>
        </div>
      </header>

      <FilterBar
        variant={isDarkEditorial ? "editorial" : "default"}
        filters={filters}
        onChange={setFilters}
        bankOptions={bankNames}
        parentCategoryOptions={parentCategoryOptions}
        subCategoryOptions={subCategoryOptions}
        dateScope={dateScope}
        dateScopeLoading={dateScopeLoading}
        defaultDateRange={defaultRange}
      />

      <main className="de-wrap">
        <DashboardOverview
          data={data}
          isLoading={isLoading}
          error={error}
          periodLabel={periodLabel}
          holderName={user?.name}
          bankLabel={headerBank}
        />
      </main>
    </div>
  );
}
