import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChartWidget } from "../components/dashboard/BarChartWidget";
import { FilterBar, type FilterState } from "../components/dashboard/FilterBar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PieChartWidget } from "../components/dashboard/PieChartWidget";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { BrokenWidgetCard } from "../components/widgetStudio/BrokenWidgetCard";
import { FilterSummaryBar } from "../components/widgetStudio/FilterSummaryBar";
import { WidgetStudioChatPanel } from "../components/widgetStudio/WidgetStudioChatPanel";
import { WidgetStudioDebugPanel } from "../components/widgetStudio/WidgetStudioDebugPanel";
import { useAuth } from "../hooks/useAuth";
import { useTransactionDateScope } from "../hooks/useTransactionDateScope";
import { api } from "../services/api";
import type {
  MessageFiltersPayload,
  StudioWidgetType,
  WidgetStudioLibraryItem,
  WidgetStudioPreview,
  WidgetStudioSendResponse,
  WidgetStudioSession,
} from "../types/widgetStudio";
import {
  metricValueFromPreview,
  previewHasData,
  rowsToChartData,
  studioTypeLabel,
} from "../utils/widgetStudioPreview";

const STUDIO_DISABLED = import.meta.env.VITE_WIDGET_STUDIO_ENABLED === "false";

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

export default function WidgetStudio() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [sessions, setSessions] = useState<WidgetStudioSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [library, setLibrary] = useState<WidgetStudioLibraryItem[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [preview, setPreview] = useState<WidgetStudioPreview | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Widget preview");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [brokenMessage, setBrokenMessage] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<WidgetStudioSendResponse["agent_logs"]>();
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    bankName: "",
    parentCategory: "",
    subCategories: [],
  });
  const [busy, setBusy] = useState(false);
  const [agentSending, setAgentSending] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showSaveName, setShowSaveName] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WidgetStudioSession | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<WidgetStudioLibraryItem | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const { scope: dateScope, defaultRange, loading: dateScopeLoading, bankNames } =
    useTransactionDateScope();
  const datesInitialized = useRef(false);

  useEffect(() => {
    if (datesInitialized.current || dateScopeLoading || !defaultRange) return;
    if (!filters.dateFrom && !filters.dateTo) {
      datesInitialized.current = true;
      setFilters((prev) => ({
        ...prev,
        dateFrom: defaultRange.from,
        dateTo: defaultRange.to,
      }));
    }
  }, [dateScopeLoading, defaultRange, filters.dateFrom, filters.dateTo]);

  const filterPayload: MessageFiltersPayload = useMemo(
    () => ({
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      bank: filters.bankName || undefined,
    }),
    [filters],
  );

  const loadSessions = useCallback(async () => {
    const res = await api.get<WidgetStudioSession[]>("/widget-studio/sessions");
    setSessions(res.data ?? []);
    return res.data ?? [];
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await api.get<WidgetStudioLibraryItem[]>("/widget-studio/widgets");
    setLibrary(res.data ?? []);
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
          const created = await api.post<{ id: string }>("/widget-studio/sessions");
          if (!cancelled) {
            setSessionId(created.data.id);
            await loadSessions();
          }
        }
        await loadLibrary();
      } catch {
        if (!cancelled) setSessionId(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadSessions, loadLibrary]);

  const renderLibraryWidget = useCallback(
    async (widgetId: string, signal?: AbortSignal) => {
      setPreviewError(null);
      setBrokenMessage(null);
      const params: Record<string, string> = {};
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.bankName) params.bank = filters.bankName;
      const res = await api.get<{
        data?: WidgetStudioPreview["data"];
        error?: string;
        message?: string;
      }>(`/widget-studio/widgets/${widgetId}/render`, { params, signal });
      if (res.data.error === "WIDGET_BROKEN" || res.data.error === "CATEGORY_NOT_FOUND") {
        setBrokenMessage(
          res.data.message ??
            "The category used in this widget no longer exists. Please delete it and create a new one.",
        );
        setPreview(null);
        return;
      }
      if (res.data.error) {
        setPreviewError(res.data.message ?? "Could not render widget.");
        setPreview(null);
        return;
      }
      const item = library.find((w) => w.id === widgetId);
      setPreview({
        type: (item?.type ?? "metric") as StudioWidgetType,
        data: res.data.data ?? { rows: [], scalar: 0 },
      });
      setPreviewTitle(item?.name ?? "Widget");
    },
    [filters, library],
  );

  useEffect(() => {
    if (!selectedLibraryId || STUDIO_DISABLED) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    renderAbortRef.current?.abort();
    const ac = new AbortController();
    renderAbortRef.current = ac;
    debounceRef.current = setTimeout(() => {
      void renderLibraryWidget(selectedLibraryId, ac.signal).catch((e: unknown) => {
        if (axios.isCancel(e)) return;
        setPreviewError(formatError(e));
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      ac.abort();
    };
  }, [selectedLibraryId, filterPayload, renderLibraryWidget]);

  const handlePreviewFromChat = useCallback(
    (p: WidgetStudioPreview | null, response: WidgetStudioSendResponse) => {
      setSelectedLibraryId(null);
      setBrokenMessage(null);
      setPreviewError(null);
      setPreview(p);
      setPreviewTitle(p?.type ? studioTypeLabel(p.type) : "Widget preview");
      setAgentLogs(response.agent_logs ?? undefined);
      if (p && !saveName) {
        setSaveName(p.intent_text?.slice(0, 80) ?? "My widget");
      }
    },
    [saveName],
  );

  const canSave = Boolean(preview && previewHasData(preview) && preview.abstract_query);

  const saveWidget = useCallback(
    async (andAddToDashboard: boolean) => {
      if (!canSave || !preview || !sessionId) return;
      const name = saveName.trim() || "My widget";
      setBusy(true);
      setSavedHint(null);
      try {
        const body = {
          session_id: sessionId,
          name,
          type: preview.type,
          intent_text: preview.intent_text ?? name,
          abstract_query: preview.abstract_query!,
          resolved_query: preview.resolved_query ?? "",
          hardcoded_filters: preview.hardcoded_filters ?? null,
          chart_config: preview.chart_config ?? null,
        };
        const created = await api.post<{ id: string }>("/widget-studio/widgets", body);
        await loadLibrary();
        if (andAddToDashboard) {
          await api.post(`/widget-studio/widgets/${created.data.id}/add-to-dashboard`, {
            col_span: 1,
          });
          setSavedHint(`"${name}" saved and added to your dashboard.`);
        } else {
          setSavedHint(`"${name}" saved to your library.`);
        }
        setShowSaveName(false);
      } catch (e: unknown) {
        setPreviewError(formatError(e));
      } finally {
        setBusy(false);
      }
    },
    [canSave, preview, sessionId, saveName, loadLibrary],
  );

  const discardDraft = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
    setBrokenMessage(null);
    setAgentLogs(undefined);
    setSaveName("");
    setSelectedLibraryId(null);
    setSavedHint(null);
  }, []);

  const createNewChat = useCallback(async () => {
    const created = await api.post<{ id: string }>("/widget-studio/sessions");
    setSessionId(created.data.id);
    discardDraft();
    await loadSessions();
  }, [loadSessions, discardDraft]);

  const confirmDeleteChat = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/widget-studio/sessions/${deleteTarget.id}`);
      setDeleteTarget(null);
      const list = await loadSessions();
      if (sessionId === deleteTarget.id) {
        if (list.length > 0) setSessionId(list[0].id);
        else await createNewChat();
      }
    } catch (e: unknown) {
      setDeleteError(formatError(e));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, sessionId, loadSessions, createNewChat]);

  const deleteLibraryWidget = useCallback(
    async (id: string) => {
      await api.delete(`/widget-studio/widgets/${id}`);
      setMenuOpenId(null);
      if (selectedLibraryId === id) discardDraft();
      await loadLibrary();
    },
    [selectedLibraryId, discardDraft, loadLibrary],
  );

  const confirmRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await api.patch(`/widget-studio/widgets/${renameTarget.id}`, {
      name: renameValue.trim(),
    });
    setRenameTarget(null);
    await loadLibrary();
  }, [renameTarget, renameValue, loadLibrary]);

  if (STUDIO_DISABLED) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Widget Studio is disabled</h1>
        <Link to="/dashboard" className="mt-6 inline-block text-indigo-600 text-sm font-medium">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const chartData = rowsToChartData(preview?.data?.rows);
  const metricVal = metricValueFromPreview(preview?.data);
  const showGenerating = agentSending && !preview;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Widget Studio</h1>
          <p className="text-xs text-gray-500">Describe your widget in chat · {library.length} saved</p>
        </div>
        <Link to="/dashboard" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside className="shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white lg:w-56 flex flex-col max-h-48 lg:max-h-none">
          <div className="p-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700 uppercase">Library</span>
            <button
              type="button"
              onClick={() => {
                discardDraft();
                void createNewChat();
              }}
              className="text-xs text-indigo-600 font-medium"
            >
              + New
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 space-y-1 text-sm">
            {library.map((w) => (
              <li key={w.id} className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLibraryId(w.id);
                    setPreviewTitle(w.name);
                    setSaveName(w.name);
                  }}
                  className={`w-full text-left rounded-lg px-2 py-2 pr-8 ${
                    selectedLibraryId === w.id
                      ? "bg-indigo-50 ring-1 ring-indigo-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-1 font-medium truncate">
                    {w.broken && (
                      <span className="text-amber-500" title="Category missing">
                        ⚠
                      </span>
                    )}
                    {w.name}
                  </span>
                  <span className="text-[10px] text-gray-400">{studioTypeLabel(w.type)}</span>
                </button>
                <button
                  type="button"
                  aria-label="Menu"
                  onClick={() => setMenuOpenId(menuOpenId === w.id ? null : w.id)}
                  className="absolute right-1 top-2 text-gray-400 hover:text-gray-600 px-1"
                >
                  ⋮
                </button>
                {menuOpenId === w.id && (
                  <div className="absolute right-0 top-10 z-10 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-xs">
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
                      onClick={() => {
                        setRenameTarget(w);
                        setRenameValue(w.name);
                        setMenuOpenId(null);
                      }}
                    >
                      Edit name
                    </button>
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
                      onClick={() => void deleteLibraryWidget(w.id)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
                      disabled={w.broken}
                      onClick={async () => {
                        setMenuOpenId(null);
                        setBusy(true);
                        try {
                          await api.post(`/widget-studio/widgets/${w.id}/add-to-dashboard`, {
                            col_span: 1,
                          });
                          setSavedHint(`"${w.name}" added to dashboard.`);
                        } catch (e: unknown) {
                          setPreviewError(formatError(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Add to dashboard
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-gray-200">
          <div className="shrink-0 border-b border-gray-200 bg-white">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              bankOptions={bankNames}
              parentCategoryOptions={[]}
              subCategoryOptions={[]}
              dateScope={dateScope}
              dateScopeLoading={dateScopeLoading}
              defaultDateRange={defaultRange}
            />
          </div>

          <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
            <FilterSummaryBar
              filters={filters}
              bankOptions={bankNames}
              defaultDateFrom={defaultRange?.from}
              defaultDateTo={defaultRange?.to}
            />
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
            {brokenMessage && (
              <BrokenWidgetCard title={previewTitle} message={brokenMessage} />
            )}

            {!brokenMessage && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">{previewTitle}</h2>
                {showGenerating && (
                  <p className="text-xs text-gray-500 italic mb-4">Widget generating…</p>
                )}
                {!preview && !showGenerating && (
                  <p className="text-sm text-gray-500 py-8 text-center">
                    Describe a widget in chat to see a live preview here.
                  </p>
                )}
                {preview?.type === "metric" && (
                  <MetricCard
                    title={previewTitle}
                    value={metricVal}
                    format="currency"
                    isLoading={showGenerating}
                    error={null}
                  />
                )}
                {(preview?.type === "bar" ||
                  preview?.type === "line" ||
                  preview?.type === "multibar") && (
                  <BarChartWidget
                    title={previewTitle}
                    data={chartData}
                    isLoading={showGenerating}
                    error={null}
                  />
                )}
                {preview?.type === "pie" && (
                  <PieChartWidget
                    title={previewTitle}
                    data={chartData}
                    isLoading={showGenerating}
                    error={null}
                  />
                )}
              </div>
            )}

            {isSuperAdmin && (
              <WidgetStudioDebugPanel
                preview={preview}
                previewError={previewError}
                agentLogs={agentLogs ?? null}
              />
            )}

            {canSave && (
              <div className="space-y-2">
                {showSaveName ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Widget name"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveWidget(false)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSaveName(true)}
                    className="text-sm text-indigo-600 font-medium"
                  >
                    Name this widget before saving…
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col min-h-[280px] lg:min-h-0 lg:w-[min(380px,36vw)] shrink-0 p-3">
          <WidgetStudioChatPanel
            sessionId={sessionId}
            filters={filterPayload}
            isSuperAdmin={isSuperAdmin}
            onPreview={handlePreviewFromChat}
            onSendingChange={setAgentSending}
            showSaveActions={canSave}
            canSave={canSave && Boolean(saveName.trim())}
            saveBusy={busy}
            onSave={() => {
              if (!showSaveName) setShowSaveName(true);
              else void saveWidget(false);
            }}
            onSaveAndAddToDashboard={() => {
              if (!showSaveName) setShowSaveName(true);
              else void saveWidget(true);
            }}
            onDiscard={discardDraft}
          />
        </div>

        <aside className="shrink-0 border-b lg:border-b-0 lg:border-l border-gray-200 bg-white lg:w-48 flex flex-col max-h-36 lg:max-h-none">
          <div className="p-3 border-b flex justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase">Chats</span>
            <button type="button" onClick={() => void createNewChat()} className="text-xs text-indigo-600">
              + New
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 space-y-1 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="group flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSessionId(s.id);
                    discardDraft();
                  }}
                  className={`flex-1 text-left rounded-lg px-2 py-1.5 truncate ${
                    sessionId === s.id ? "bg-indigo-50 text-indigo-800 font-medium" : "hover:bg-gray-50"
                  }`}
                >
                  {s.title ?? "Chat"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
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
        message={`Delete "${deleteTarget?.title ?? "this chat"}"?`}
        confirmLabel="Delete"
        loading={deleteBusy}
        error={deleteError}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteChat()}
      />

      <ConfirmModal
        open={renameTarget !== null}
        title="Rename widget"
        message={
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        }
        confirmLabel="Save"
        onClose={() => setRenameTarget(null)}
        onConfirm={() => void confirmRename()}
      />
    </div>
  );
}
