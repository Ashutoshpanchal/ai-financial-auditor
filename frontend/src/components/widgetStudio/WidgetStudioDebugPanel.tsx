import { useState } from "react";
import type { AgentLogEntry, WidgetStudioPreview } from "../../types/widgetStudio";

interface WidgetStudioDebugPanelProps {
  preview: WidgetStudioPreview | null;
  previewError: string | null;
  agentLogs: AgentLogEntry[] | null;
  abstractQuery?: string;
  resolvedQuery?: string;
}

/** Super-admin collapsible debug panel below the live preview. */
export function WidgetStudioDebugPanel({
  preview,
  previewError,
  agentLogs,
  abstractQuery,
  resolvedQuery,
}: WidgetStudioDebugPanelProps) {
  const [open, setOpen] = useState(true);

  const copyResolved = () => {
    const q = resolvedQuery ?? preview?.resolved_query ?? "";
    if (q) void navigator.clipboard.writeText(q);
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 text-left text-xs font-semibold text-amber-900 uppercase tracking-wide"
      >
        Super admin debug {open ? "▼" : "▶"}
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-3 border-t border-amber-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-amber-800 mb-1">Query (abstract)</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-white p-2 text-[10px] font-mono whitespace-pre-wrap">
                {abstractQuery ?? preview?.abstract_query ?? "—"}
              </pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <p className="text-[10px] font-medium text-amber-800">Query (resolved)</p>
                <button
                  type="button"
                  onClick={copyResolved}
                  className="text-[10px] font-medium text-amber-900 hover:underline shrink-0"
                >
                  Copy query
                </button>
              </div>
              <pre className="max-h-32 overflow-auto rounded-lg bg-white p-2 text-[10px] font-mono whitespace-pre-wrap">
                {resolvedQuery ?? preview?.resolved_query ?? "—"}
              </pre>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-amber-800 mb-1">Result JSON</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-white p-2 text-[10px] font-mono whitespace-pre-wrap">
                {preview?.data ? JSON.stringify(preview.data, null, 2) : "—"}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-medium text-amber-800 mb-1">Error</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-white p-2 text-[10px] text-red-700 font-mono whitespace-pre-wrap">
                {previewError ?? "—"}
              </pre>
            </div>
          </div>
          {agentLogs && agentLogs.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-amber-800 mb-1">Agent logs (last turn)</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-white p-2 text-[10px] font-mono whitespace-pre-wrap">
                {JSON.stringify(agentLogs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
