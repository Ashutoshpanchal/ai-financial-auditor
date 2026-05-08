interface Widget {
  id: string;
  title: string;
  widget_type: "metric" | "bar_chart" | "pie_chart" | "line_chart";
  is_default: boolean;
}

interface EditModePanelProps {
  widgets: Widget[];
  placedWidgetIds: string[];
  onAdd: (widgetId: string) => void;
  onDelete: (widgetId: string) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<Widget["widget_type"], string> = {
  metric: "Metric",
  bar_chart: "Bar Chart",
  pie_chart: "Pie Chart",
  line_chart: "Line Chart",
};

const TYPE_COLORS: Record<Widget["widget_type"], string> = {
  metric: "bg-indigo-100 text-indigo-700",
  bar_chart: "bg-emerald-100 text-emerald-700",
  pie_chart: "bg-amber-100 text-amber-700",
  line_chart: "bg-sky-100 text-sky-700",
};

/**
 * EditModePanel — slide-in right drawer shown while the dashboard is in edit mode.
 *
 * Displays the full widget library. For each widget the user can:
 *   - See if it is already placed on the grid ("On Grid" badge) or add it ("Add to Grid").
 *   - Delete it (disabled for default widgets; a tooltip explains why).
 *
 * Calls `onClose` when the user clicks "Done".
 */
export function EditModePanel({
  widgets,
  placedWidgetIds,
  onAdd,
  onDelete,
  onClose,
}: EditModePanelProps) {
  const placedSet = new Set(placedWidgetIds);

  return (
    <>
      {/* Backdrop — clicking it exits edit mode */}
      <div
        className="fixed inset-0 bg-black/20 z-30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col bg-white shadow-xl"
        aria-label="Edit Dashboard panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Edit Dashboard</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit panel"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            {/* X icon */}
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Sub-heading */}
        <p className="px-5 py-3 text-xs text-gray-500">
          Add or remove widgets from your dashboard grid.
        </p>

        {/* Widget list */}
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 px-3">
          {widgets.length === 0 && (
            <li className="py-8 text-center text-sm text-gray-400">
              No widgets in your library.
            </li>
          )}

          {widgets.map((widget) => {
            const isPlaced = placedSet.has(widget.id);
            const canDelete = !widget.is_default;

            return (
              <li
                key={widget.id}
                className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-gray-50 transition"
              >
                {/* Widget info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {widget.title}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[widget.widget_type]}`}
                  >
                    {TYPE_LABELS[widget.widget_type]}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {isPlaced ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                      On Grid
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(widget.id)}
                      className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      Add to Grid
                    </button>
                  )}

                  {/* Delete — disabled (with tooltip) for default widgets */}
                  <span title={!canDelete ? "Cannot delete default widgets" : undefined}>
                    <button
                      type="button"
                      onClick={() => canDelete && onDelete(widget.id)}
                      disabled={!canDelete}
                      aria-label={`Delete ${widget.title}`}
                      className={`rounded-lg p-1.5 transition ${
                        canDelete
                          ? "text-red-400 hover:bg-red-50 hover:text-red-600"
                          : "cursor-not-allowed text-gray-300"
                      }`}
                    >
                      {/* Trash icon */}
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 transition"
          >
            Done
          </button>
        </div>
      </aside>
    </>
  );
}
