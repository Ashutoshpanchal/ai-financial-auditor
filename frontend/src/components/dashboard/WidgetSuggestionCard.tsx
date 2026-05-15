interface WidgetSuggestion {
  title: string;
  widget_type: "metric" | "bar_chart" | "pie_chart" | "line_chart";
  query_config: Record<string, unknown>;
}

interface WidgetSuggestionCardProps {
  suggestion: WidgetSuggestion;
  onAdd: (suggestion: WidgetSuggestion) => void;
  onDismiss: () => void;
}

const WIDGET_TYPE_LABELS: Record<WidgetSuggestion["widget_type"], string> = {
  metric: "Metric",
  bar_chart: "Bar Chart",
  pie_chart: "Pie Chart",
  line_chart: "Line Chart",
};

const WIDGET_TYPE_BADGE_COLORS: Record<WidgetSuggestion["widget_type"], string> = {
  metric: "bg-emerald-100 text-emerald-700",
  bar_chart: "bg-blue-100 text-blue-700",
  pie_chart: "bg-purple-100 text-purple-700",
  line_chart: "bg-amber-100 text-amber-700",
};

/**
 * Build a human-readable description of what the widget will display
 * based on its query config.
 */
function buildDescription(suggestion: WidgetSuggestion): string {
  const { query_config } = suggestion;
  const agg = String(query_config.aggregation ?? "sum").toLowerCase();
  const field = String(query_config.field ?? "amount").replace(/_/g, " ");
  const groupByRaw = query_config.group_by;
  const groupBy =
    groupByRaw !== undefined && groupByRaw !== null
      ? String(groupByRaw).replace(/_/g, " ")
      : undefined;

  let desc = `Shows the ${agg} of ${field}`;
  if (groupBy) {
    desc += ` grouped by ${groupBy}`;
  }

  const activeFilters = Object.entries(
    (query_config.filters as Record<string, string | null> | undefined) ?? {},
  ).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (activeFilters.length > 0) {
    const filterSummary = activeFilters
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join(", ");
    desc += ` (filtered by ${filterSummary})`;
  }

  return `${desc}.`;
}

/**
 * WidgetSuggestionCard — displayed inside the chat panel when the LLM
 * recommends adding a widget to the dashboard.
 *
 * The card uses an indigo-tinted border and background to visually distinguish
 * it from regular chat messages. The user can either accept (Add to Dashboard)
 * or dismiss the suggestion.
 */
export function WidgetSuggestionCard({
  suggestion,
  onAdd,
  onDismiss,
}: WidgetSuggestionCardProps) {
  const badgeColor = WIDGET_TYPE_BADGE_COLORS[suggestion.widget_type];
  const typeLabel = WIDGET_TYPE_LABELS[suggestion.widget_type];
  const description = buildDescription(suggestion);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
          Suggested Widget
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {typeLabel}
        </span>
      </div>

      {/* Widget title */}
      <p className="text-sm font-semibold text-gray-900 mb-1">
        {suggestion.title}
      </p>

      {/* Description */}
      <p className="text-xs text-gray-600 mb-4">{description}</p>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAdd(suggestion)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 transition"
        >
          Add to Dashboard
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1 transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
