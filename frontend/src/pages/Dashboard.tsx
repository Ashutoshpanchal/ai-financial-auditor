import { useCallback, useEffect, useState } from "react";
import { FilterBar, FilterState } from "../components/dashboard/FilterBar";
import { WidgetGrid } from "../components/dashboard/WidgetGrid";
import { EditModePanel } from "../components/dashboard/EditModePanel";
import { ChatPanel } from "../components/dashboard/ChatPanel";

const API = "http://localhost:8000";

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

interface QueryConfig {
  aggregation: string;
  field: string;
  group_by?: string;
  filters?: Record<string, string | null>;
  format?: string;
}

interface WidgetSuggestion {
  title: string;
  widget_type: "metric" | "bar_chart" | "pie_chart" | "line_chart";
  query_config: QueryConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [grid, setGrid] = useState<GridItem[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    bankName: "",
    category: "",
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingLayout, setIsLoadingLayout] = useState(true);

  // Load widgets + layout on mount
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

  // Create or load a chat session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const sessions = await apiFetch<{ id: string }[]>("/chat/sessions");
        if (sessions.length > 0) {
          setSessionId(sessions[0].id);
        } else {
          const newSession = await apiFetch<{ id: string }>("/chat/sessions", {
            method: "POST",
            body: JSON.stringify({ title: "Dashboard Chat" }),
          });
          setSessionId(newSession.id);
        }
      } catch {
        // no session — ChatPanel shows placeholder
      }
    };
    void initSession();
  }, []);

  // Persist layout to backend whenever grid changes (after initial load)
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
    [saveLayout]
  );

  // Remove widget from grid (not from library)
  const handleRemoveFromGrid = useCallback(
    (widgetId: string) => {
      const newGrid = grid.filter((g) => g.widget_id !== widgetId);
      setGrid(newGrid);
      void saveLayout(newGrid);
    },
    [grid, saveLayout]
  );

  // Add widget to grid from the edit panel
  const handleAddToGrid = useCallback(
    (widgetId: string) => {
      if (grid.find((g) => g.widget_id === widgetId)) return;
      const newItem: GridItem = {
        widget_id: widgetId,
        row: Math.floor(grid.length / 3),
        col: grid.length % 3,
        col_span: 1,
      };
      const newGrid = [...grid, newItem];
      setGrid(newGrid);
      void saveLayout(newGrid);
    },
    [grid, saveLayout]
  );

  // Delete widget from library (and remove from grid)
  const handleDeleteWidget = useCallback(
    async (widgetId: string) => {
      try {
        await apiFetch(`/dashboard/widgets/${widgetId}`, { method: "DELETE" });
        setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
        setGrid((prev) => prev.filter((g) => g.widget_id !== widgetId));
      } catch {
        // ignore
      }
    },
    []
  );

  // Add suggested widget to library, then to grid
  const handleAddSuggestedWidget = useCallback(
    async (suggestion: WidgetSuggestion) => {
      try {
        const created = await apiFetch<Widget>("/dashboard/widgets", {
          method: "POST",
          body: JSON.stringify({
            title: suggestion.title,
            widget_type: suggestion.widget_type,
            query_config: suggestion.query_config,
          }),
        });
        setWidgets((prev) => [...prev, created]);
        handleAddToGrid(created.id);
      } catch {
        // ignore
      }
    },
    [handleAddToGrid]
  );

  const placedIds = grid.map((g) => g.widget_id);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
      {/* ── Left panel: widget grid ── */}
      {!leftCollapsed && (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-gray-200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shrink-0">
            <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50 transition"
                title="Collapse dashboard"
              >
                ◀
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="shrink-0">
            <FilterBar filters={filters} onChange={setFilters} />
          </div>

          {/* Widget grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingLayout ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="bg-white rounded-2xl shadow-sm animate-pulse h-32" />
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
          </div>
        </div>
      )}

      {/* Collapsed left expander */}
      {leftCollapsed && (
        <button
          type="button"
          onClick={() => setLeftCollapsed(false)}
          className="flex items-center justify-center w-8 bg-white border-r border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition shrink-0"
          title="Expand dashboard"
        >
          ▶
        </button>
      )}

      {/* ── Right panel: chat ── */}
      {!rightCollapsed && (
        <div className="flex flex-col w-[380px] shrink-0 overflow-hidden bg-gray-50">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-gray-900">Finance Assistant</h2>
            <button
              type="button"
              onClick={() => setRightCollapsed(true)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50 transition"
              title="Collapse chat"
            >
              ▶
            </button>
          </div>

          <div className="flex-1 overflow-hidden p-3">
            <ChatPanel
              sessionId={sessionId}
              onAddWidget={(s) => void handleAddSuggestedWidget(s)}
            />
          </div>
        </div>
      )}

      {/* Collapsed right expander */}
      {rightCollapsed && (
        <button
          type="button"
          onClick={() => setRightCollapsed(false)}
          className="flex items-center justify-center w-8 bg-white border-l border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition shrink-0"
          title="Expand chat"
        >
          ◀
        </button>
      )}

      {/* Edit mode panel (overlay drawer) */}
      {isEditMode && (
        <EditModePanel
          widgets={widgets}
          placedWidgetIds={placedIds}
          onAdd={handleAddToGrid}
          onDelete={(id) => void handleDeleteWidget(id)}
          onClose={() => setIsEditMode(false)}
        />
      )}
    </div>
  );
}
