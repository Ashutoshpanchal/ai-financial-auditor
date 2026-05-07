import { useRef, useState } from "react";

interface Props {
  /** graph_json from the audit report — used to show stats */
  graphJson: Record<string, unknown> | null;
  /** URL path to the Graphify-generated HTML file — embedded in iframe */
  graphHtmlPath: string | null;
  documentId: string;
}

export function GraphifyPanel({ graphJson, graphHtmlPath, documentId: _documentId }: Props) {
  const [tab, setTab] = useState<"graph" | "stats">("graph");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const nodeCount = (graphJson?.nodes as unknown[])?.length ?? 0;
  const edgeCount = (graphJson?.links as unknown[])?.length ?? 0;

  if (!graphHtmlPath && !graphJson) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-400">Knowledge graph not yet generated for this report.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div>
          <h3 className="font-semibold text-gray-800">Spending Knowledge Graph</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {nodeCount} nodes · {edgeCount} edges — powered by Graphify
          </p>
        </div>
        <div className="flex gap-2">
          <TabButton active={tab === "graph"} onClick={() => setTab("graph")}>
            Interactive Graph
          </TabButton>
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
            Community Stats
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "graph" && graphHtmlPath ? (
          <iframe
            ref={iframeRef}
            src={graphHtmlPath}
            title="Spending Knowledge Graph"
            className="h-[600px] w-full rounded-lg border border-gray-100"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : tab === "graph" ? (
          <div className="flex h-64 items-center justify-center text-gray-400 text-sm">
            Graph visualization not available for this report.
          </div>
        ) : (
          <GraphStats graphJson={graphJson} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-green-100 text-green-700"
          : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function GraphStats({ graphJson }: { graphJson: Record<string, unknown> | null }) {
  if (!graphJson) return <p className="text-sm text-gray-400">No graph data available.</p>;

  const nodes = (graphJson.nodes as Array<{ id: string; label: string; community?: number }>) ?? [];
  const communities: Record<number, string[]> = {};

  for (const node of nodes) {
    const cid = node.community ?? 0;
    if (!communities[cid]) communities[cid] = [];
    communities[cid].push(node.label ?? node.id);
  }

  return (
    <div className="space-y-4">
      {Object.entries(communities).map(([cid, labels]) => (
        <div key={cid} className="rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Community {cid}
          </p>
          <div className="flex flex-wrap gap-2">
            {labels.slice(0, 12).map((label) => (
              <span
                key={label}
                className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700"
              >
                {label}
              </span>
            ))}
            {labels.length > 12 && (
              <span className="text-xs text-gray-400">+{labels.length - 12} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
