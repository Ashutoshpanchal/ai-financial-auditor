import { useEffect, useRef, useState } from "react";
import { MetricCard } from "./MetricCard";
import { BarChartWidget } from "./BarChartWidget";
import { PieChartWidget } from "./PieChartWidget";

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  bankName: string;
  category: string;
}

interface WidgetGridProps {
  widgets: Widget[];
  grid: GridItem[];
  filters: FilterState;
  isEditMode: boolean;
  onGridChange: (newGrid: GridItem[]) => void;
  onRemove: (widgetId: string) => void;
}

interface ChartRow {
  label: string;
  value: number;
}

interface MetricApiData {
  value: number;
  format?: "currency" | "number";
}

type WidgetApiData = MetricApiData | ChartRow[];

const API_BASE = "http://localhost:8000";

const COL_SPAN_CLASSES: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
};

// ─── Per-widget data hook ─────────────────────────────────────────────────────

function useWidgetData(widgetId: string, filters: FilterState) {
  const [data, setData] = useState<WidgetApiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    if (filters.bankName) params.set("bank_name", filters.bankName);
    if (filters.category) params.set("category", filters.category);

    fetch(`${API_BASE}/dashboard/widgets/${widgetId}/data?${params}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WidgetApiData>;
      })
      .then((json) => { if (!cancelled) { setData(json); setIsLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [widgetId, filters.dateFrom, filters.dateTo, filters.bankName, filters.category]);

  return { data, isLoading, error };
}

function isMetricData(d: WidgetApiData | null): d is MetricApiData {
  return d !== null && !Array.isArray(d) && typeof (d as MetricApiData).value === "number";
}

// ─── WidgetCell ───────────────────────────────────────────────────────────────

interface WidgetCellProps {
  item: GridItem;
  widget: Widget;
  filters: FilterState;
  isEditMode: boolean;
  isDragOver: boolean;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
}

function WidgetCell({
  item,
  widget,
  filters,
  isEditMode,
  isDragOver,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: WidgetCellProps) {
  const { data, isLoading, error } = useWidgetData(item.widget_id, filters);

  const metricValue = isMetricData(data) ? data.value : 0;
  const metricFormat = isMetricData(data) ? (data.format ?? "number") : "number";
  const chartData = Array.isArray(data) ? data : [];

  const colSpan = COL_SPAN_CLASSES[item.col_span] ?? "col-span-1";

  return (
    <div
      className={`${colSpan} relative`}
      draggable={isEditMode}
      onDragStart={() => onDragStart(item.widget_id)}
      onDragOver={(e) => onDragOver(e, item.widget_id)}
      onDrop={() => onDrop(item.widget_id)}
      style={{
        outline: isDragOver && isEditMode ? "2px dashed #6366f1" : undefined,
        borderRadius: isDragOver && isEditMode ? "16px" : undefined,
        opacity: isEditMode ? 0.95 : 1,
        cursor: isEditMode ? "grab" : "default",
      }}
    >
      {/* Edit controls — shown inline, no overlay */}
      {isEditMode && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <span
            className="flex items-center justify-center w-7 h-7 bg-white/90 border border-gray-200 rounded-lg shadow-sm text-gray-400 cursor-grab select-none text-xs"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(item.widget_id); }}
            className="flex items-center justify-center w-7 h-7 bg-white/90 border border-red-200 rounded-lg shadow-sm text-red-400 hover:text-red-600 hover:bg-red-50 transition"
            title="Remove from dashboard"
          >
            ✕
          </button>
        </div>
      )}

      {widget.widget_type === "metric" && (
        <MetricCard title={widget.title} value={metricValue} format={metricFormat} isLoading={isLoading} error={error} />
      )}
      {(widget.widget_type === "bar_chart" || widget.widget_type === "line_chart") && (
        <BarChartWidget title={widget.title} data={chartData} isLoading={isLoading} error={error} />
      )}
      {widget.widget_type === "pie_chart" && (
        <PieChartWidget title={widget.title} data={chartData} isLoading={isLoading} error={error} />
      )}
    </div>
  );
}

// ─── WidgetGrid ───────────────────────────────────────────────────────────────

export function WidgetGrid({ widgets, grid, filters, isEditMode, onGridChange, onRemove }: WidgetGridProps) {
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const widgetMap = new Map(widgets.map((w) => [w.id, w]));

  function handleDragStart(id: string) {
    dragId.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDrop(targetId: string) {
    const sourceId = dragId.current;
    dragId.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const from = grid.findIndex((g) => g.widget_id === sourceId);
    const to = grid.findIndex((g) => g.widget_id === targetId);
    if (from === -1 || to === -1) return;

    const next = [...grid];
    [next[from], next[to]] = [next[to], next[from]];
    onGridChange(next);
  }

  if (grid.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-lg font-medium">No widgets on your dashboard.</p>
        <p className="text-sm mt-1">Click "Edit" then "Add Widgets" to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {grid.map((item) => {
        const widget = widgetMap.get(item.widget_id);
        if (!widget) return null;
        return (
          <WidgetCell
            key={item.widget_id}
            item={item}
            widget={widget}
            filters={filters}
            isEditMode={isEditMode}
            isDragOver={dragOverId === item.widget_id}
            onRemove={onRemove}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        );
      })}
    </div>
  );
}

export default WidgetGrid;
