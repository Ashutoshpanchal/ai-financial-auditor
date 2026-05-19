import type { FilterState } from "../dashboard/FilterBar";

interface FilterSummaryBarProps {
  filters: FilterState;
  bankOptions: string[];
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

/** Human-readable active filter summary above the preview. */
export function FilterSummaryBar({
  filters,
  bankOptions,
  defaultDateFrom = "",
  defaultDateTo = "",
}: FilterSummaryBarProps) {
  const dateActive =
    (filters.dateFrom && filters.dateFrom !== defaultDateFrom) ||
    (filters.dateTo && filters.dateTo !== defaultDateTo);
  const bankActive = filters.bankNames.length > 0;

  if (!dateActive && !bankActive) {
    return (
      <p className="text-xs text-gray-500 mb-3" data-testid="filter-summary">
        No filters applied
      </p>
    );
  }

  const parts: string[] = [];
  if (dateActive && filters.dateFrom && filters.dateTo) {
    parts.push(`${filters.dateFrom} → ${filters.dateTo}`);
  } else if (dateActive) {
    parts.push("Custom date range");
  }
  if (bankActive) {
    parts.push(
      filters.bankNames.length === 1
        ? filters.bankNames[0]
        : `${filters.bankNames.length} banks`,
    );
  } else if (bankOptions.length > 1) {
    parts.push("All banks");
  }

  return (
    <p className="text-xs text-gray-600 mb-3" data-testid="filter-summary">
      <span className="font-medium text-gray-700">Filtered by:</span> {parts.join(" · ")}
    </p>
  );
}
