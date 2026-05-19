import { DateRangePicker } from "../common/DateRangePicker";
import type { DateRangeValue, TransactionDateScope } from "../../utils/dateRangePresets";
import { capitalizeWords } from "../../utils/capitalizeWords";

export interface FilterState {
  dateFrom: string; // ISO date string "YYYY-MM-DD" or ""
  dateTo: string; // ISO date string "YYYY-MM-DD" or ""
  /** Selected banks; empty = all banks. */
  bankNames: string[];
  parentCategory: string; // "" means no filter
  /** Selected sub-category labels (empty = all subs under parent). */
  subCategories: string[];
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  /** Light default; editorial uses dark dashboard tokens. */
  variant?: "default" | "editorial";
  /** Distinct bank names for dropdown; when empty, bank stays a free-text input. */
  bankOptions?: string[];
  /** Parent category options for dropdown (Widget Studio / dashboard). */
  parentCategoryOptions?: string[];
  /** Sub-category labels for the selected parent. */
  subCategoryOptions?: string[];
  /** Single `<select>` vs Category Insights–style multi-select checkboxes for sub-categories. */
  subCategoryInputMode?: "select" | "checkboxes";
  /** Transaction bounds for the date picker. */
  dateScope?: TransactionDateScope | null;
  dateScopeLoading?: boolean;
  /** Data-aware default range used when Clear is pressed. */
  defaultDateRange?: DateRangeValue | null;
  /** When set, shows Apply before Clear and uses draft date picker until Apply. */
  onApply?: () => void;
  applyLoading?: boolean;
  applyDisabled?: boolean;
  /** Single bank dropdown vs multi-select checkboxes (Widget Studio). */
  bankSelectionMode?: "single" | "multi";
}

const EMPTY_FILTERS: FilterState = {
  dateFrom: "",
  dateTo: "",
  bankNames: [],
  parentCategory: "",
  subCategories: [],
};

/**
 * GlobalFilterBar — horizontal filter bar for the dashboard.
 *
 * Controlled component: owns no state. Every field change calls `onChange`
 * with the full updated FilterState so the parent can broadcast to all widgets.
 */
export function FilterBar({
  filters,
  onChange,
  variant = "default",
  bankOptions = [],
  parentCategoryOptions = [],
  subCategoryOptions = [],
  subCategoryInputMode = "checkboxes",
  dateScope = null,
  dateScopeLoading = false,
  defaultDateRange = null,
  onApply,
  applyLoading = false,
  applyDisabled = false,
  bankSelectionMode = "single",
}: FilterBarProps) {
  function handleField(field: keyof FilterState, value: string) {
    const next = { ...filters, [field]: value } as FilterState;
    if (field === "parentCategory") {
      next.subCategories = [];
    }
    onChange(next);
  }

  function handleDateChange(range: DateRangeValue) {
    onChange({ ...filters, dateFrom: range.from, dateTo: range.to });
  }

  function handleSubSelectSingle(value: string) {
    onChange({
      ...filters,
      subCategories: value ? [value] : [],
    });
  }

  function toggleSubCategory(label: string) {
    const set = new Set(filters.subCategories);
    if (set.has(label)) set.delete(label);
    else set.add(label);
    onChange({ ...filters, subCategories: Array.from(set) });
  }

  function clearSubCategories() {
    onChange({ ...filters, subCategories: [] });
  }

  function toggleBankName(name: string) {
    const set = new Set(filters.bankNames);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    onChange({ ...filters, bankNames: Array.from(set) });
  }

  function clearBanks() {
    onChange({ ...filters, bankNames: [] });
  }

  function handleBankSelectSingle(value: string) {
    onChange({ ...filters, bankNames: value ? [value] : [] });
  }

  function handleClear() {
    const dates = defaultDateRange ?? { from: "", to: "" };
    onChange({
      ...EMPTY_FILTERS,
      dateFrom: dates.from,
      dateTo: dates.to,
    });
  }

  const hasMaster = parentCategoryOptions.length > 0;
  const parentSelected = Boolean(filters.parentCategory);
  const showSubCategoryRow = hasMaster && parentSelected;
  const isEditorial = variant === "editorial";

  return (
    <div
      className={
        isEditorial
          ? "de-filter-bar w-full border-b border-[var(--border2)] bg-[var(--surface)] px-4 py-3 sm:px-6 lg:px-8"
          : "w-full border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6 lg:px-8"
      }
    >
      <div className={isEditorial ? "mx-auto max-w-[1120px]" : "max-w-7xl mx-auto"}>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            label="Date range"
            value={{ from: filters.dateFrom, to: filters.dateTo }}
            onChange={(range) => handleDateChange(range)}
            scope={dateScope}
            loading={dateScopeLoading}
            applyMode={onApply ? "confirm" : "live"}
          />

          {bankSelectionMode === "single" && (
            <div className="flex flex-col gap-0.5">
              <label htmlFor="filter-bank" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Bank
              </label>
              {bankOptions.length > 0 ? (
                <select
                  id="filter-bank"
                  value={filters.bankNames[0] ?? ""}
                  onChange={(e) => handleBankSelectSingle(e.target.value)}
                  className="w-44 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-gray-800"
                >
                  <option value="">All banks</option>
                  {bankOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="filter-bank"
                  type="text"
                  value={filters.bankNames[0] ?? ""}
                  onChange={(e) => handleBankSelectSingle(e.target.value)}
                  placeholder="All banks"
                  className="w-36 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-500 dark:focus:bg-gray-800"
                />
              )}
            </div>
          )}

          {hasMaster && (
            <div className="flex flex-col gap-0.5">
              <label htmlFor="filter-parent-category" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Parent category
              </label>
              <select
                id="filter-parent-category"
                value={filters.parentCategory}
                onChange={(e) => handleField("parentCategory", e.target.value)}
                className="w-44 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-gray-800"
              >
                <option value="">All parents</option>
                {parentCategoryOptions.map((p) => (
                  <option key={p} value={p}>
                    {capitalizeWords(p)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Apply / Clear — aligned to bottom of label+input stacks */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-transparent select-none">&nbsp;</span>
            <div className="flex gap-2">
              {onApply && (
                <button
                  type="button"
                  onClick={onApply}
                  disabled={applyDisabled || applyLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  {applyLoading ? "Applying…" : "Apply"}
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                disabled={applyLoading}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {bankSelectionMode === "multi" && bankOptions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Banks (optional)</span>
              <button
                type="button"
                onClick={clearBanks}
                className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Clear
              </button>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
              {bankOptions.map((b) => (
                <label
                  key={b}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white bg-white px-2 py-1 text-xs text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={filters.bankNames.includes(b)}
                    onChange={() => toggleBankName(b)}
                    className="rounded border-gray-300 text-indigo-600"
                  />
                  {b}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Sub-categories — same block layout as Category Insights (below primary filters) */}
        {showSubCategoryRow && subCategoryInputMode === "select" && (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="flex max-w-md flex-col gap-1 sm:max-w-lg">
              <label htmlFor="filter-sub-category" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Sub-category (optional)
              </label>
              <select
                id="filter-sub-category"
                value={filters.subCategories[0] ?? ""}
                onChange={(e) => handleSubSelectSingle(e.target.value)}
                className="w-full max-w-md rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-gray-800 sm:w-80"
              >
                <option value="">All sub-categories</option>
                {subCategoryOptions.map((s) => (
                  <option key={s} value={s}>
                    {capitalizeWords(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {showSubCategoryRow && subCategoryInputMode === "checkboxes" && (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sub-categories (optional)</span>
              <button
                type="button"
                onClick={clearSubCategories}
                className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Clear
              </button>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
              {subCategoryOptions.length === 0 ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">No sub-categories for this parent.</span>
              ) : (
                subCategoryOptions.map((s) => (
                  <label
                    key={s}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white bg-white px-2 py-1 text-xs text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <input
                      type="checkbox"
                      checked={filters.subCategories.includes(s)}
                      onChange={() => toggleSubCategory(s)}
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    {capitalizeWords(s)}
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
