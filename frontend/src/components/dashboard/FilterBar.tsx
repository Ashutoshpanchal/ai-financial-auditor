export interface FilterState {
  dateFrom: string; // ISO date string "YYYY-MM-DD" or ""
  dateTo: string; // ISO date string "YYYY-MM-DD" or ""
  bankName: string; // "" means no filter
  category: string; // "" means no filter (legacy)
  parentCategory: string; // "" means no filter
  subCategory: string; // "" means no filter
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  /** Parent category options for dropdown (Widget Studio / dashboard). */
  parentCategoryOptions?: string[];
  /** Sub-category options for the selected parent. */
  subCategoryOptions?: string[];
}

const EMPTY_FILTERS: FilterState = {
  dateFrom: "",
  dateTo: "",
  bankName: "",
  category: "",
  parentCategory: "",
  subCategory: "",
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
  parentCategoryOptions = [],
  subCategoryOptions = [],
}: FilterBarProps) {
  function handleField(field: keyof FilterState, value: string) {
    const next = { ...filters, [field]: value };
    if (field === "parentCategory") {
      next.subCategory = "";
    }
    onChange(next);
  }

  function handleClear() {
    onChange(EMPTY_FILTERS);
  }

  return (
    <div className="w-full bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
        {/* From date */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="filter-date-from" className="text-xs font-medium text-gray-500">
            From
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleField("dateFrom", e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition"
          />
        </div>

        {/* To date */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="filter-date-to" className="text-xs font-medium text-gray-500">
            To
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleField("dateTo", e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition"
          />
        </div>

        {/* Bank name */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="filter-bank" className="text-xs font-medium text-gray-500">
            Bank
          </label>
          <input
            id="filter-bank"
            type="text"
            value={filters.bankName}
            onChange={(e) => handleField("bankName", e.target.value)}
            placeholder="Any bank"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition w-36"
          />
        </div>

        {parentCategoryOptions.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <label htmlFor="filter-parent-category" className="text-xs font-medium text-gray-500">
              Parent category
            </label>
            <select
              id="filter-parent-category"
              value={filters.parentCategory}
              onChange={(e) => handleField("parentCategory", e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition w-44"
            >
              <option value="">Any parent</option>
              {parentCategoryOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        {parentCategoryOptions.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <label htmlFor="filter-sub-category" className="text-xs font-medium text-gray-500">
              Sub-category
            </label>
            <select
              id="filter-sub-category"
              value={filters.subCategory}
              onChange={(e) => handleField("subCategory", e.target.value)}
              disabled={!filters.parentCategory}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition w-44 disabled:opacity-50"
            >
              <option value="">Any sub</option>
              {subCategoryOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="filter-category" className="text-xs font-medium text-gray-500">
            Category
          </label>
          <input
            id="filter-category"
            type="text"
            value={filters.category}
            onChange={(e) => handleField("category", e.target.value)}
            placeholder="Any category"
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 transition w-40"
          />
        </div>

        {/* Clear button — aligned to bottom of label+input stacks */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-transparent select-none">&nbsp;</span>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
