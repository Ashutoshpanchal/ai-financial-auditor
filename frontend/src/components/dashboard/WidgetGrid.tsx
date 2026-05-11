import { useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

interface FilterState {
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

// ─── API types ────────────────────────────────────────────────────────────────

interface ChartRow {
  label: string;
  value: number;
}

interface MetricApiData {
  value: number;
  format?: "currency" | "number";
}

type WidgetApiData = MetricApiData | ChartRow[];

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";

const COL_SPAN_CLASSES: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
};

// ─── Per-widget data fetching hook ───────────────────────────────────────────

function useWidgetData(widgetId: string, filters: FilterState) {
  const [data, setData] = useState<WidgetApiData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    if (filters.bankName) params.set("bank_name", filters.bankName);
    if (filters.category) params.set("category", filters.category);

    const url = `${API_BASE}/dashboard/widgets/${widgetId}/data?${params.toString()}`;

    setIsLoading(true);
    setError(null);

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json() as Promise<WidgetApiData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load widget data");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [widgetId, filters.dateFrom, filters.dateTo, filters.bankName, filters.category]);

  return { data, isLoading, error };
}

// ─── Helper: resolve Tailwind col-span class ─────────────────────────────────

function colSpanClass(span: number): string {
  return COL_SPAN_CLASSES[span] ?? "col-span-1";
}

// ─── Helper: is metric data ───────────────────────────────────────────────────

function isMetricData(data: WidgetApiData | null): data is MetricApiData {
  return data !== null && !Array.isArray(data) && typeof (data as MetricApiData).value === "number";
}

function isChartData(data: WidgetApiData | null): data is ChartRow[] {
  return Array.isArray(data);
}

// ─── SortableCell ─────────────────────────────────────────────────────────────

interface SortableCellProps {
  item: GridItem;
  widget: Widget;
  filters: FilterState;
  isEditMode: boolean;
  onRemove: (widgetId: string) => void;
}

function SortableCell({ item, widget, filters, isEditMode, onRemove }: SortableCellProps) {
  const { data, isLoading, error } = useWidgetData(item.widget_id, filters);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.widget_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };

  const metricValue = isMetricData(data) ? data.value : 0;
  const metricFormat = isMetricData(data) ? (data.format ?? "number") : "number";
  const chartData = isChartData(data) ? data : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${colSpanClass(item.col_span)} relative group`}
    >
      {/* Edit-mode overlay controls */}
      {isEditMode && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          {/* Drag handle */}
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-500 hover:text-gray-800 hover:border-gray-400 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <span className="text-xs leading-none select-none">≡</span>
          </button>

          {/* Remove button */}
          <button
            type="button"
            onClick={() => onRemove(item.widget_id)}
            className="flex items-center justify-center w-7 h-7 bg-white border border-red-200 rounded-lg shadow-sm text-red-400 hover:text-red-600 hover:border-red-400"
            title="Remove widget"
          >
            <span className="text-xs leading-none select-none">×</span>
          </button>
        </div>
      )}

      {/* Widget content */}
      {widget.widget_type === "metric" && (
        <MetricCard
          title={widget.title}
          value={metricValue}
          format={metricFormat}
          isLoading={isLoading}
          error={error}
        />
      )}

      {widget.widget_type === "bar_chart" && (
        <BarChartWidget
          title={widget.title}
          data={chartData}
          isLoading={isLoading}
          error={error}
        />
      )}

      {widget.widget_type === "pie_chart" && (
        <PieChartWidget
          title={widget.title}
          data={chartData}
          isLoading={isLoading}
          error={error}
        />
      )}

      {widget.widget_type === "line_chart" && (
        <BarChartWidget
          title={widget.title}
          data={chartData}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  );
}

// ─── WidgetGrid ───────────────────────────────────────────────────────────────

export function WidgetGrid({
  widgets,
  grid,
  filters,
  isEditMode,
  onGridChange,
  onRemove,
}: WidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /** Look up a Widget by id — returns undefined if not found */
  function findWidget(id: string): Widget | undefined {
    return widgets.find((w) => w.id === id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = grid.findIndex((item) => item.widget_id === active.id);
    const newIndex = grid.findIndex((item) => item.widget_id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    onGridChange(arrayMove(grid, oldIndex, newIndex));
  }

  const sortableIds = grid.map((item) => item.widget_id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-4">
          {grid.map((item) => {
            const widget = findWidget(item.widget_id);
            if (!widget) return null;

            return (
              <SortableCell
                key={item.widget_id}
                item={item}
                widget={widget}
                filters={filters}
                isEditMode={isEditMode}
                onRemove={onRemove}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default WidgetGrid;
