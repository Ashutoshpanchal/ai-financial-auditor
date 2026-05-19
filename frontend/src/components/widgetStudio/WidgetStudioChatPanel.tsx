import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import type {
  AgentLogEntry,
  MessageFiltersPayload,
  WidgetStudioMessage,
  WidgetStudioPreview,
  WidgetStudioSendResponse,
} from "../../types/widgetStudio";
import { chartChipLabel } from "../../utils/widgetStudioPreview";

interface WidgetStudioChatPanelProps {
  sessionId: string | null;
  filters: MessageFiltersPayload;
  isSuperAdmin?: boolean;
  onPreview: (preview: WidgetStudioPreview | null, response: WidgetStudioSendResponse) => void;
  onSendingChange?: (sending: boolean) => void;
  showSaveActions?: boolean;
  canSave?: boolean;
  saveBusy?: boolean;
  onSave?: () => void;
  onSaveAndAddToDashboard?: () => void;
  onDiscard?: () => void;
}

function formatSendError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const st = err.response?.status;
    if (st === 429) return "Too many requests. Please wait a moment.";
    if (st === 500) return "Something went wrong. Please try again.";
    const d = err.response?.data;
    if (d && typeof d === "object" && "detail" in d) {
      const det = (d as { detail: unknown }).detail;
      if (typeof det === "string") return det;
    }
  }
  return "Something went wrong. Please try again.";
}

function ChecklistCard({ checklist }: { checklist: Record<string, boolean> }) {
  const items = [
    { key: "metric_confirmed", label: "Metric confirmed" },
    { key: "category_confirmed", label: "Category confirmed" },
    { key: "chart_type_selected", label: "Chart type selected" },
    { key: "filters_applied", label: "Filters applied" },
  ];
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-900">
      <p className="font-semibold mb-2">Intent confirmed</p>
      <ul className="space-y-1">
        {items.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden>{checklist[key] ? "✓" : "○"}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentLogsExpandable({ logs }: { logs: AgentLogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-medium text-amber-800 hover:underline"
      >
        {open ? "Hide" : "Show"} agent logs
      </button>
      {open && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-amber-50 p-2 text-[10px] font-mono">
          {JSON.stringify(logs, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Chat panel wired to ``/widget-studio/sessions/:id/message``. */
export function WidgetStudioChatPanel({
  sessionId,
  filters,
  isSuperAdmin = false,
  onPreview,
  onSendingChange,
  showSaveActions = false,
  canSave = false,
  saveBusy = false,
  onSave,
  onSaveAndAddToDashboard,
  onDiscard,
}: WidgetStudioChatPanelProps) {
  const [messages, setMessages] = useState<WidgetStudioMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastAgentLogs, setLastAgentLogs] = useState<AgentLogEntry[] | null>(null);
  const [pendingChips, setPendingChips] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    const res = await api.get<WidgetStudioMessage[]>(
      `/widget-studio/sessions/${sessionId}/messages`,
    );
    setMessages(res.data ?? []);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    void loadMessages().catch(() => setMessages([]));
  }, [sessionId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    onSendingChange?.(isSending);
  }, [isSending, onSendingChange]);

  const sendText = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim() || isSending) return;
      const trimmed = text.trim();
      setInput("");
      setIsSending(true);
      setSendError(null);
      setLastAgentLogs(null);

      const optimistic: WidgetStudioMessage = {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: trimmed,
        agent_name: null,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const body = {
          message: trimmed,
          filters: {
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            bank: filters.bank || undefined,
          },
        };
        const { data } = await api.post<WidgetStudioSendResponse>(
          `/widget-studio/sessions/${sessionId}/message`,
          body,
        );
        await loadMessages();
        setPendingChips(data.chart_suggestions ?? []);
        onPreview(data.widget_preview, data);
        if (isSuperAdmin && data.agent_logs) {
          setLastAgentLogs(data.agent_logs);
        }
      } catch (err: unknown) {
        setSendError(formatSendError(err));
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, isSending, filters, loadMessages, onPreview, isSuperAdmin],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendText(input);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400 px-6">
        <p className="text-sm">Starting session…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isClarification =
            !isUser &&
            (msg.metadata?.clarification === true ||
              Boolean(msg.metadata?.chart_suggestions?.length && !msg.metadata?.resolved_intent));
          const checklist = msg.metadata?.clarification_checklist;

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[90%] space-y-2">
                <div
                  className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    isUser
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : isClarification
                        ? "bg-violet-50 text-violet-900 border border-violet-200 rounded-bl-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {isClarification && (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 mb-1">
                      Clarification
                    </p>
                  )}
                  {msg.content}
                </div>
                {checklist && typeof checklist === "object" && (
                  <ChecklistCard checklist={checklist} />
                )}
                {!isUser &&
                  msg.metadata?.chart_suggestions &&
                  msg.metadata.chart_suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.metadata.chart_suggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={isSending}
                          onClick={() => void sendText(`Use ${chartChipLabel(t)} chart type`)}
                          className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {chartChipLabel(t)}
                        </button>
                      ))}
                    </div>
                  )}
                {isSuperAdmin && lastAgentLogs && msg === messages[messages.length - 1] && (
                  <AgentLogsExpandable logs={lastAgentLogs} />
                )}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex justify-start" data-testid="typing-indicator">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-gray-600 italic">
              Widget generating…
            </div>
          </div>
        )}

        {!isSending && pendingChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pendingChips.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void sendText(`Use ${chartChipLabel(t)} chart type`)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
              >
                {chartChipLabel(t)}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
        {showSaveActions && (
          <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/80 p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-900">Widget ready</p>
            <div className="flex flex-wrap gap-2">
              {onSave && (
                <button
                  type="button"
                  disabled={saveBusy || !canSave}
                  onClick={() => void onSave()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save as new
                </button>
              )}
              {onSaveAndAddToDashboard && (
                <button
                  type="button"
                  disabled={saveBusy || !canSave}
                  onClick={() => void onSaveAndAddToDashboard()}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  Save and add to dashboard
                </button>
              )}
              {onDiscard && (
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={onDiscard}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Discard
                </button>
              )}
            </div>
          </div>
        )}
        {sendError && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {sendError}
          </p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder="Describe the widget you want… (Enter to send)"
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendText(input)}
            disabled={isSending || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
