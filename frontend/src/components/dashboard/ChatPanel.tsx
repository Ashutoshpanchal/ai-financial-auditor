import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { WidgetSuggestionCard } from "./WidgetSuggestionCard";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface WidgetSuggestion {
  title: string;
  widget_type: "metric" | "bar_chart" | "pie_chart" | "line_chart";
  query_config: Record<string, unknown>;
}

interface SendMessageResponse {
  response: string;
  session_id: string;
  widget_suggestion: WidgetSuggestion | null;
  widget_suggestion_version?: number | null;
  draft_state?: Record<string, unknown> | null;
  clarification_only?: boolean;
}

interface SessionDetail {
  id: string;
  title: string | null;
  session_kind?: string;
  messages: ChatMessage[];
  draft_state?: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatPanelProps {
  sessionId: string | null;
  /** Dashboard: add suggested widget from the card. Ignored when ``onWidgetSuggestion`` is set. */
  onAddWidget?: (suggestion: WidgetSuggestion) => void;
  /** Widget Studio: merge suggestion into draft (no suggestion card). */
  onWidgetSuggestion?: (suggestion: WidgetSuggestion) => void;
  onAnalyze?: () => void;
  /** Hide the Analyze Documents header (e.g. Widget Studio). */
  hideAnalyze?: boolean;
  inputPlaceholder?: string;
  /** Widget Studio: only merge suggestions when clarification_only is false. */
  mergeOnlyWhenReady?: boolean;
  onDraftStateChange?: (draft: Record<string, unknown> | null) => void;
  /** Widget Studio: show "Generating your widget…" instead of typing dots while sending. */
  showGeneratingLabel?: boolean;
}

const SENSITIVE_ERROR =
  /sqlalchemy|psycopg2|syntax error|programmingerror|from\s+transactions|transactions\.|raw_metric_sql|line\s+\d+:/i;

function formatSendError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const st = err.response?.status;
    if (st === 500) {
      return "Something went wrong. Please try again.";
    }
    if (st === 422 || st === 404) {
      const d = err.response?.data;
      if (d && typeof d === "object" && "detail" in d) {
        const det = (d as { detail: unknown }).detail;
        const msg = typeof det === "string" ? det : "";
        if (msg && !SENSITIVE_ERROR.test(msg)) {
          return msg;
        }
        return "We could not process that request. Please try again.";
      }
    }
    return "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export function ChatPanel({
  sessionId,
  onAddWidget,
  onWidgetSuggestion,
  onAnalyze,
  hideAnalyze = false,
  inputPlaceholder = "Ask about your finances… (Enter to send)",
  mergeOnlyWhenReady = false,
  onDraftStateChange,
  showGeneratingLabel = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [suggestion, setSuggestion] = useState<WidgetSuggestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    api
      .get<SessionDetail>(`/chat/sessions/${sessionId}`)
      .then((res) => {
        if (!cancelled) {
          setMessages(res.data.messages ?? []);
          onDraftStateChange?.(res.data.draft_state ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load session");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, onDraftStateChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!sessionId || !input.trim() || isSending) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);
    setSuggestion(null);
    setSendError(null);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const { data } = await api.post<SendMessageResponse>(
        `/chat/sessions/${sessionId}/message`,
        { content: text },
      );
      const assistantMsg: ChatMessage = { role: "assistant", content: data.response };
      setMessages((prev) => [...prev, assistantMsg]);

      onDraftStateChange?.(data.draft_state ?? null);

      const shouldMerge =
        data.widget_suggestion &&
        (!mergeOnlyWhenReady || !data.clarification_only);

      if (shouldMerge && data.widget_suggestion) {
        if (onWidgetSuggestion) {
          onWidgetSuggestion(data.widget_suggestion);
        } else {
          setSuggestion(data.widget_suggestion);
        }
      }
    } catch (err: unknown) {
      setSendError(formatSendError(err));
      setInput(text);
      try {
        const res = await api.get<SessionDetail>(`/chat/sessions/${sessionId}`);
        setMessages(res.data.messages ?? []);
        onDraftStateChange?.(res.data.draft_state ?? null);
      } catch {
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsSending(false);
    }
  }, [sessionId, input, isSending, onWidgetSuggestion, mergeOnlyWhenReady, onDraftStateChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400 px-6">
        <p className="text-base">Select or start a chat session to begin.</p>
      </div>
    );
  }

  const showSuggestionCard = Boolean(suggestion && !onWidgetSuggestion);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm overflow-hidden">
      {!hideAnalyze && (
        <div className="px-4 pt-4 pb-2 border-b border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!onAnalyze}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Analyze Documents
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loadError && <p className="text-sm text-red-500 text-center">{loadError}</p>}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-gray-600">
              {showGeneratingLabel ? (
                <span className="italic">Generating your widget…</span>
              ) : (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        )}

        {showSuggestionCard && suggestion && (
          <div className="flex justify-start">
            <div className="max-w-[90%]">
              <WidgetSuggestionCard
                suggestion={suggestion}
                onAdd={(s) => {
                  onAddWidget?.(s);
                  setSuggestion(null);
                }}
                onDismiss={() => setSuggestion(null)}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
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
            placeholder={inputPlaceholder}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={isSending || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
