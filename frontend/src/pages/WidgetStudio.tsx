import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChartWidget } from "../components/dashboard/BarChartWidget";
import { ChatPanel } from "../components/dashboard/ChatPanel";
import { FilterBar, type FilterState } from "../components/dashboard/FilterBar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PieChartWidget } from "../components/dashboard/PieChartWidget";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { api } from "../services/api";
import {
  makeInitialWidgetDraft,
  draftPreviewKey,
  mergeWidgetSuggestion,
  validateDraftForPreview,
  type ColSpan,
  type WidgetDraft,
  type WidgetSuggestion,
  type WidgetType,
} from "../utils/widgetDraftModel";

const STUDIO_DISABLED = import.meta.env.VITE_WIDGET_STUDIO_ENABLED === "false";
/** Re-enable when manual widget editor returns. */
const SHOW_MANUAL_EDITOR = false;
/** Re-enable when horizontal library strip returns. */
const SHOW_LIBRARY_STRIP = false;

interface PreviewResponse {
  data: unknown;
  human_query: string;
}

interface GridItem {
  widget_id: string;
  row: number;
  col: number;
  col_span: number;
}

interface ChatSessionSummary {
  id: string;
  title: string | null;
  session_kind: string;
  message_count: number;
  updated_at: string;
}

interface LibraryWidget {
  id: string;
  title: string;
  widget_type: WidgetType;
  query_config: Record<string, unknown>;
}

interface MasterSplit {
  global: Record<string, string[]>;
  user: Record<string, string[]>;
}

function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object" && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      return typeof d === "string" ? d : JSON.stringify(d);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Request failed";
}

function isMetricPreview(d: unknown): d is { value: number; format?: string } {
  return (
    d !== null &&
    typeof d === "object" &&
    "value" in d &&
    typeof (d as { value: unknown }).value === "number"
  );
}

function isChartPreview(d: unknown): d is { label: string; value: number }[] {
  return Array.isArray(d) && d.every((r) => r && typeof r.label === "string" && typeof r.value === "number");
}

function defaultQueryForType(widgetType: WidgetType): WidgetDraft["query_config"] {
  if (widgetType === "metric") {
    return { aggregation: "sum", field: "debit", format: "currency" };
  }
  return { aggregation: "sum", field: "debit", group_by: "month", format: "currency" };
}

function mergeMaster(split: MasterSplit): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const src of [split.global, split.user]) {
    for (const [parent, subs] of Object.entries(src)) {
      const existing = out[parent] ?? [];
      out[parent] = [...new Set([...existing, ...subs])].sort();
    }
  }
  return out;
}

export default function WidgetStudio() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [libraryWidgets, setLibraryWidgets] = useState<LibraryWidget[]>([]);
  const [categoryMaster, setCategoryMaster] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<WidgetDraft>(() => makeInitialWidgetDraft());
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    bankName: "",
    category: "",
    parentCategory: "",
    subCategory: "",
  });
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [appliedHint, setAppliedHint] = useState<string | null>(null);
  const [lastOkPreviewKey, setLastOkPreviewKey] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [studioDraftState, setStudioDraftState] = useState<Record<string, unknown> | null>(
    null,
  );
  const [queryOpen, setQueryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const previewAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parentOptions = useMemo(
    () => Object.keys(categoryMaster).sort(),
    [categoryMaster],
  );
  const subOptions = useMemo(
    () => (filters.parentCategory ? categoryMaster[filters.parentCategory] ?? [] : []),
    [categoryMaster, filters.parentCategory],
  );

  const filterParams = useMemo(
    () => ({
      date_from: filters.dateFrom || "",
      date_to: filters.dateTo || "",
      bank_name: filters.bankName || "",
      category: filters.category || "",
      parent_category: filters.parentCategory || "",
      sub_category: filters.subCategory || "",
    }),
    [filters],
  );

  const previewKey = useMemo(() => draftPreviewKey(draft, filterParams), [draft, filterParams]);

  const loadSessions = useCallback(async () => {
    const list = await api.get<ChatSessionSummary[]>("/chat/sessions", {
      params: { session_kind: "widget_studio" },
    });
    setSessions(list.data ?? []);
    return list.data ?? [];
  }, []);

  useEffect(() => {
    if (STUDIO_DISABLED) return;
    let cancelled = false;
    const run = async () => {
      try {
        const list = await loadSessions();
        if (cancelled) return;
        if (list.length > 0) {
          setSessionId((prev) => prev ?? list[0].id);
        } else {
          const created = await api.post<{ id: string }>("/chat/sessions", {
            title: "Widget Studio",
            session_kind: "widget_studio",
          });
          if (!cancelled) {
            setSessionId(created.data.id);
            await loadSessions();
          }
        }
        const [widgetsRes, masterRes] = await Promise.all([
          api.get<LibraryWidget[]>("/dashboard/widgets"),
          api.get<MasterSplit>("/categories/master/split"),
        ]);
        if (!cancelled) {
          setLibraryWidgets(widgetsRes.data ?? []);
          setCategoryMaster(mergeMaster(masterRes.data));
        }
      } catch {
        if (!cancelled) setSessionId(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const createNewChat = useCallback(async () => {
    const created = await api.post<{ id: string }>("/chat/sessions", {
      title: `Widget chat ${new Date().toLocaleString()}`,
      session_kind: "widget_studio",
    });
    setSessionId(created.data.id);
    await loadSessions();
  }, [loadSessions]);

  const confirmDeleteChat = useCallback(async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.delete(`/chat/sessions/${targetId}`);
      setDeleteTarget(null);
      const list = await loadSessions();
      if (sessionId === targetId) {
        if (list.length > 0) {
          setSessionId(list[0].id);
        } else {
          await createNewChat();
        }
      }
    } catch (err: unknown) {
      setDeleteError(formatError(err));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, sessionId, loadSessions, createNewChat]);

  const loadLibraryWidget = useCallback((w: LibraryWidget) => {
    setDraft({
      title: w.title,
      widget_type: w.widget_type,
      query_config: w.query_config as WidgetDraft["query_config"],
      col_span: 1,
    });
    setAppliedHint(`Loaded "${w.title}" from your library into the draft.`);
  }, []);

  const runPreview = useCallback(
    async (signal: AbortSignal) => {
      const err = validateDraftForPreview(draft);
      if (err) {
        setPreview(null);
        setPreviewError(err);
        return;
      }

      setPreviewError(null);
      try {
        const body: Record<string, unknown> = {
          widget_type: draft.widget_type,
          query_config: draft.query_config,
        };
        if (filters.dateFrom) body.date_from = filters.dateFrom;
        if (filters.dateTo) body.date_to = filters.dateTo;
        if (filters.bankName) body.bank_name = filters.bankName;
        if (filters.category) body.category = filters.category;
        if (filters.parentCategory) body.parent_category = filters.parentCategory;
        if (filters.subCategory) body.sub_category = filters.subCategory;

        const res = await api.post<PreviewResponse>("/dashboard/widgets/preview", body, { signal });
        setPreview(res.data);
        setLastOkPreviewKey(previewKey);
      } catch (e: unknown) {
        if (axios.isCancel(e)) return;
        setPreview(null);
        setPreviewError(formatError(e));
        setLastOkPreviewKey(null);
      }
    },
    [draft, filters, previewKey],
  );

  // Debounced preview + cancel in-flight
  useEffect(() => {
    if (STUDIO_DISABLED) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    previewAbortRef.current?.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;

    debounceRef.current = setTimeout(() => {
      void runPreview(ac.signal);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      ac.abort();
    };
  }, [runPreview]);

  const refreshLibrary = useCallback(async () => {
    try {
      const res = await api.get<LibraryWidget[]>("/dashboard/widgets");
      setLibraryWidgets(res.data ?? []);
    } catch {
      /* library refresh is best-effort */
    }
  }, []);

  const handleSuggestion = useCallback((s: WidgetSuggestion) => {
    setDraft((d) => mergeWidgetSuggestion(d, s));
    setAppliedHint("Widget ready — preview updated on the left.");
  }, []);

  const handleDraftStateChange = useCallback((state: Record<string, unknown> | null) => {
    setStudioDraftState(state);
    const last = state?.last_suggestion;
    if (
      state?.status === "ready" &&
      last &&
      typeof last === "object" &&
      "title" in last &&
      "widget_type" in last
    ) {
      handleSuggestion(last as WidgetSuggestion);
    }
  }, [handleSuggestion]);

  const handleWidgetTypeChange = (wt: WidgetType) => {
    setDraft((d) => ({
      ...d,
      widget_type: wt,
      query_config: defaultQueryForType(wt),
    }));
  };

  const draftValid = validateDraftForPreview(draft) === null;
  const canSave = draftValid && lastOkPreviewKey === previewKey && preview !== null;
  const showPreviewPanel = draftValid || preview !== null || previewError !== null;

  const formatSavedHint = useCallback(
    (base: string) => {
      const q = preview?.human_query?.trim();
      if (!q) return base;
      const short = q.length > 120 ? `${q.slice(0, 117)}…` : q;
      return `${base} Query: ${short}`;
    },
    [preview?.human_query],
  );

  const saveToLibrary = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    setSavedHint(null);
    setAppliedHint(null);
    try {
      await api.post("/dashboard/widgets", {
        title: draft.title.trim(),
        widget_type: draft.widget_type,
        query_config: draft.query_config,
      });
      await refreshLibrary();
      setSavedHint(
        formatSavedHint(`"${draft.title.trim()}" saved to your widget library.`),
      );
    } catch (e: unknown) {
      setPreviewError(formatError(e));
    } finally {
      setBusy(false);
    }
  }, [canSave, draft, formatSavedHint, refreshLibrary]);

  const saveAndAddToDashboard = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    setSavedHint(null);
    setAppliedHint(null);
    try {
      const created = await api.post<{ id: string }>("/dashboard/widgets", {
        title: draft.title.trim(),
        widget_type: draft.widget_type,
        query_config: draft.query_config,
      });
      const layoutRes = await api.get<{ cols: number; grid: GridItem[] }>("/dashboard/layout");
      const grid = [...(layoutRes.data.grid ?? [])];
      const newItem: GridItem = {
        widget_id: created.data.id,
        row: Math.floor(grid.length / 3),
        col: grid.length % 3,
        col_span: draft.col_span,
      };
      await api.put("/dashboard/layout", {
        layout: { cols: layoutRes.data.cols ?? 3, grid: [...grid, newItem] },
      });
      await refreshLibrary();
      setSavedHint(
        formatSavedHint(`"${draft.title.trim()}" saved and added to your dashboard.`),
      );
    } catch (e: unknown) {
      setPreviewError(formatError(e));
    } finally {
      setBusy(false);
    }
  }, [canSave, draft, formatSavedHint, refreshLibrary]);

  if (STUDIO_DISABLED) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Widget Studio is disabled</h1>
        <p className="mt-2 text-sm text-gray-600">
          Set <code className="text-xs">VITE_WIDGET_STUDIO_ENABLED</code> to re-enable the UI.
        </p>
        <Link to="/dashboard" className="mt-6 inline-block text-indigo-600 text-sm font-medium">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const metricData = preview?.data && isMetricPreview(preview.data) ? preview.data : null;
  const chartData = preview?.data && isChartPreview(preview.data) ? preview.data : [];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Widget Studio</h1>
          <p className="text-xs text-gray-500">
            Build and test your widget on the left; chat on the right to describe what you want.
          </p>
        </div>
        <Link to="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">

        {/* Draft + preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-gray-200">
          <div className="shrink-0 border-b border-gray-200 bg-white">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              parentCategoryOptions={parentOptions}
              subCategoryOptions={subOptions}
            />
          </div>

          {SHOW_LIBRARY_STRIP && libraryWidgets.length > 0 && (
            <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-2">
              <p className="text-xs font-medium text-gray-600 mb-2">Widget library</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {libraryWidgets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => loadLibraryWidget(w)}
                    className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 hover:border-indigo-300"
                  >
                    {w.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 space-y-4 max-w-4xl w-full mx-auto">
            {appliedHint && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                {appliedHint}
              </div>
            )}
            {savedHint && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {savedHint}
              </div>
            )}
            {previewError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {previewError}
              </div>
            )}

            {!showPreviewPanel && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center max-w-md mx-auto w-full">
                <p className="text-sm text-gray-600">
                  Answer questions in chat on the right — your widget preview will appear here.
                </p>
                {studioDraftState?.status === "clarifying" && (
                  <p className="mt-2 text-xs text-gray-400">Waiting for enough detail to generate…</p>
                )}
              </div>
            )}

            {showPreviewPanel && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-md mx-auto w-full">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Live preview</h2>
              {draft.widget_type === "metric" && (
                <MetricCard
                  title={draft.title}
                  value={metricData?.value ?? 0}
                  format={(metricData?.format as "currency" | "number") ?? "number"}
                  isLoading={preview === null && !previewError}
                  error={preview && !metricData ? "Invalid metric preview" : null}
                />
              )}
              {(draft.widget_type === "bar_chart" || draft.widget_type === "line_chart") && (
                <BarChartWidget
                  title={draft.title}
                  data={chartData}
                  isLoading={preview === null && !previewError}
                  error={preview && !isChartPreview(preview.data) ? "Invalid chart preview" : null}
                />
              )}
              {draft.widget_type === "pie_chart" && (
                <PieChartWidget
                  title={draft.title}
                  data={chartData}
                  isLoading={preview === null && !previewError}
                  error={preview && !isChartPreview(preview.data) ? "Invalid chart preview" : null}
                />
              )}
            </div>
            )}

            <div className="flex flex-wrap gap-2 max-w-md mx-auto w-full">
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={() => void saveToLibrary()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Save to library
              </button>
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={() => void saveAndAddToDashboard()}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Save and add to dashboard
              </button>
            </div>
            {!canSave && validateDraftForPreview(draft) === null && (
              <p className="text-xs text-gray-500 text-center max-w-md mx-auto">
                Save unlocks after a successful preview for the current filters.
              </p>
            )}

            {preview?.human_query && (
              <div className="max-w-md mx-auto w-full">
                <button
                  type="button"
                  onClick={() => setQueryOpen((v) => !v)}
                  className="text-xs font-medium text-indigo-600"
                >
                  {queryOpen ? "Hide" : "Show"} stored query
                </button>
                {queryOpen && (
                  <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                    {preview.human_query}
                  </pre>
                )}
              </div>
            )}

            {SHOW_MANUAL_EDITOR && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Widget settings</h2>

              <div>
                <label htmlFor="ws-title" className="block text-xs font-medium text-gray-600">
                  Title
                </label>
                <input
                  id="ws-title"
                  type="text"
                  value={draft.title}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, title: e.target.value }));
                    setAppliedHint(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-medium text-gray-600">Widget type</span>
                  <select
                    value={draft.widget_type}
                    onChange={(e) => {
                      handleWidgetTypeChange(e.target.value as WidgetType);
                      setAppliedHint(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="metric">Metric</option>
                    <option value="bar_chart">Bar chart</option>
                    <option value="line_chart">Line chart</option>
                    <option value="pie_chart">Pie chart</option>
                  </select>
                </div>
                <div>
                  <span className="block text-xs font-medium text-gray-600">Width on dashboard (columns)</span>
                  <select
                    value={draft.col_span}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, col_span: Number(e.target.value) as ColSpan }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value={1}>1 column</option>
                    <option value={2}>2 columns</option>
                    <option value={3}>3 columns</option>
                  </select>
                </div>
              </div>

              {draft.widget_type === "metric" && (
                <div className="border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="text-sm font-medium text-indigo-600"
                  >
                    {advancedOpen ? "▼" : "▶"} Advanced: raw SQL metric
                  </button>
                  {advancedOpen && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-gray-500">
                        Single SELECT on <code className="text-xs">transactions</code> only. User scope is
                        injected server-side.
                      </p>
                      <textarea
                        rows={6}
                        spellCheck={false}
                        value={(draft.query_config.raw_metric_sql as string) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            query_config: v.trim()
                              ? { raw_metric_sql: v, format: d.query_config.format ?? "currency" }
                              : defaultQueryForType("metric"),
                          }));
                          setAppliedHint(null);
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                        placeholder="SELECT COALESCE(SUM(debit), 0) FROM transactions WHERE debit > 0"
                      />
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const raw = draft.query_config.raw_metric_sql;
                if (typeof raw === "string" && raw.trim()) return null;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                    <div>
                      <span className="block text-xs font-medium text-gray-600">Aggregation</span>
                      <select
                        value={draft.query_config.aggregation ?? "sum"}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            query_config: { ...d.query_config, aggregation: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {["sum", "count", "avg", "max", "min"].map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-gray-600">Field</span>
                      <select
                        value={draft.query_config.field ?? "debit"}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            query_config: { ...d.query_config, field: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="debit">debit</option>
                        <option value="credit">credit</option>
                      </select>
                    </div>
                    {draft.widget_type !== "metric" && (
                      <div className="sm:col-span-2">
                        <span className="block text-xs font-medium text-gray-600">Group by</span>
                        <select
                          value={draft.query_config.group_by ?? "month"}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              query_config: { ...d.query_config, group_by: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="month">month</option>
                          <option value="day">day</option>
                          <option value="category">category</option>
                          <option value="bank_name">bank_name</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <span className="block text-xs font-medium text-gray-600">Format</span>
                      <select
                        value={draft.query_config.format ?? "currency"}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            query_config: { ...d.query_config, format: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="currency">currency</option>
                        <option value="number">number</option>
                      </select>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-gray-600">Txn type filter</span>
                      <select
                        value={(draft.query_config.filters?.transaction_type as string) ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            query_config: {
                              ...d.query_config,
                              filters: {
                                ...d.query_config.filters,
                                transaction_type: v === "" ? null : v,
                              },
                            },
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">(none)</option>
                        <option value="debit">debit</option>
                        <option value="credit">credit</option>
                      </select>
                    </div>
                  </div>
                );
              })()}

            </div>
            )}
          </div>
        </div>

        <div className="flex flex-col min-h-[280px] lg:min-h-0 lg:w-[min(380px,36vw)] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 p-3">
          <ChatPanel
            sessionId={sessionId}
            hideAnalyze
            mergeOnlyWhenReady
            showGeneratingLabel
            onDraftStateChange={handleDraftStateChange}
            onWidgetSuggestion={handleSuggestion}
            inputPlaceholder="Describe the widget you want… (Enter to send)"
          />
        </div>

        <aside className="shrink-0 border-b lg:border-b-0 lg:border-l border-gray-200 bg-white lg:w-52 flex flex-col max-h-40 lg:max-h-none">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Chats</span>
            <button
              type="button"
              onClick={() => void createNewChat()}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              + New
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 space-y-1 text-sm min-h-0">
            {sessions.map((s) => (
              <li key={s.id} className="group flex items-stretch gap-0.5">
                <button
                  type="button"
                  onClick={() => setSessionId(s.id)}
                  className={`flex-1 min-w-0 text-left rounded-lg px-2 py-1.5 truncate ${
                    sessionId === s.id
                      ? "bg-indigo-50 text-indigo-800 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s.title ?? "Widget Studio"}
                  <span className="block text-[10px] text-gray-400">{s.message_count} msgs</span>
                </button>
                <button
                  type="button"
                  title="Delete chat"
                  aria-label={`Delete ${s.title ?? "chat"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError(null);
                    setDeleteTarget(s);
                  }}
                  className="shrink-0 rounded-lg px-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100 transition"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete chat"
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-gray-900">
              {deleteTarget?.title ?? "this chat"}
            </span>
            ? All messages in this conversation will be removed. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDeleteChat()}
      />
    </div>
  );
}
