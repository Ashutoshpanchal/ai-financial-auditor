import { useEffect, useRef, useState } from "react";
import { DualMetricCard } from "./DualMetricCard";
import { MetricCard } from "./MetricCard";
import { BarChartWidget } from "./BarChartWidget";
import { PieChartWidget } from "./PieChartWidget";
import type { FilterState } from "./FilterBar";
import { BrokenWidgetCard } from "../widgetStudio/BrokenWidgetCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Widget {
  id: string;
  title: string;
  widget_type: "metric" | "spend_receive_pair" | "bar_chart" | "pie_chart" | "line_chart";
  query_config: Record<string, unknown>;
  is_default: boolean;
}

interface GridItem {
  widget_id: string;
  row: number;
  col: number;
  col_span: number;
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

interface DualMetricApiData {
  spend: number;
  received: number;
  format?: "currency" | "number";
}

type WidgetApiData = MetricApiData | DualMetricApiData | ChartRow[];

interface BrokenWidgetPayload {
  error: string;
  message: string;
}

function isBrokenPayload(d: unknown): d is BrokenWidgetPayload {
  return (
    d !== null &&
    typeof d === "object" &&
    "error" in d &&
    (d as BrokenWidgetPayload).error === "WIDGET_BROKEN"
  );
}

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
  const [brokenMessage, setBrokenMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setBrokenMessage(null);

    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    if (filters.bankName) params.set("bank_name", filters.bankName);
    if (filters.parentCategory) params.set("parent_category", filters.parentCategory);
    for (const s of filters.subCategories) {
      params.append("sub_category", s);
    }

    fetch(`${API_BASE}/dashboard/widgets/${widgetId}/data?${params}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WidgetApiData | BrokenWidgetPayload>;
      })
      .then((json) => {
        if (cancelled) return;
        if (isBrokenPayload(json)) {
          setBrokenMessage(json.message);
          setData(null);
          setIsLoading(false);
          return;
        }
        setData(json);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [
    widgetId,
    filters.dateFrom,
    filters.dateTo,
    filters.bankName,
    filters.parentCategory,
    filters.subCategories.join("\0"),
  ]);

  return { data, isLoading, error, brokenMessage };
}

function isMetricData(d: WidgetApiData | null): d is MetricApiData {
  return d !== null && !Array.isArray(d) && typeof (d as MetricApiData).value === "number";
}

function isDualMetricData(d: WidgetApiData | null): d is DualMetricApiData {
  return (
    d !== null &&
    !Array.isArray(d) &&
    typeof (d as DualMetricApiData).spend === "number" &&
    typeof (d as DualMetricApiData).received === "number"
  );
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
  const { data, isLoading, error, brokenMessage } = useWidgetData(
    item.widget_id,
    filters,
  );

  if (brokenMessage) {
    return (
      <div className={`${COL_SPAN_CLASSES[item.col_span] ?? "col-span-1"}`}>
        <BrokenWidgetCard title={widget.title} message={brokenMessage} />
      </div>
    );
  }

  const metricValue = isMetricData(data) ? data.value : 0;
  const metricFormat = isMetricData(data) ? (data.format ?? "number") : "number";
  const dualData = isDualMetricData(data) ? data : null;
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
        outline: isDragOver && isEditMode ? "2px dashed #6366f1" : undefined, // indigo accent for drag target
        borderRadius: isDragOver && isEditMode ? "16px" : undefined,
        opacity: isEditMode ? 0.95 : 1,
        cursor: isEditMode ? "grab" : "default",
      }}
    >
      {/* Edit controls — shown inline, no overlay */}
      {isEditMode && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <span
            className="flex h-7 w-7 cursor-grab select-none items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-xs text-gray-400 shadow-sm dark:border-gray-700 dark:bg-gray-800/95 dark:text-gray-300"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(item.widget_id); }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white/90 text-red-400 shadow-sm transition hover:bg-red-50 hover:text-red-600 dark:border-red-900 dark:bg-gray-800/95 dark:hover:bg-red-950"
            title="Remove from dashboard"
          >
            ✕
          </button>
        </div>
      )}

      {widget.widget_type === "metric" && (
        <MetricCard title={widget.title} value={metricValue} format={metricFormat} isLoading={isLoading} error={error} />
      )}
      {widget.widget_type === "spend_receive_pair" && (
        <DualMetricCard
          title={widget.title}
          spend={dualData?.spend ?? 0}
          received={dualData?.received ?? 0}
          format={(dualData?.format as "currency" | "number") ?? "currency"}
          isLoading={isLoading}
          error={error}
        />
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
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <p className="text-lg font-medium text-gray-600 dark:text-gray-300">No widgets on your dashboard.</p>
        <p className="mt-1 text-sm text-center max-w-md">
          Upload statements or ask an admin to configure default widgets in Widget Studio.
        </p>
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
