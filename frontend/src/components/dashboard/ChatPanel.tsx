import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetSuggestionCard } from "./WidgetSuggestionCard";

const API = "http://localhost:8000";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
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

interface SendMessageResponse {
  response: string;
  session_id: string;
  widget_suggestion: WidgetSuggestion | null;
}

interface SessionDetail {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
}

interface ChatPanelProps {
  sessionId: string | null;
  onAddWidget: (suggestion: WidgetSuggestion) => void;
  onAnalyze?: () => void;
}

export function ChatPanel({ sessionId, onAddWidget, onAnalyze }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [suggestion, setSuggestion] = useState<WidgetSuggestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load session history on sessionId change
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    fetch(`${API}/chat/sessions/${sessionId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SessionDetail>;
      })
      .then((session) => {
        if (!cancelled) setMessages(session.messages ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load session");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!sessionId || !input.trim() || isSending) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);
    setSuggestion(null);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`${API}/chat/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as SendMessageResponse;
      const assistantMsg: ChatMessage = { role: "assistant", content: data.response };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.widget_suggestion) {
        setSuggestion(data.widget_suggestion);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Send failed";
      const errorMsg: ChatMessage = { role: "assistant", content: `Error: ${errMsg}` };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  }, [sessionId, input, isSending]);

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

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Analyze button */}
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

      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loadError && (
          <p className="text-sm text-red-500 text-center">{loadError}</p>
        )}

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
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {suggestion && (
          <div className="flex justify-start">
            <div className="max-w-[90%]">
              <WidgetSuggestionCard
                suggestion={suggestion}
                onAdd={(s) => {
                  onAddWidget(s);
                  setSuggestion(null);
                }}
                onDismiss={() => setSuggestion(null)}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder="Ask about your finances… (Enter to send)"
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
