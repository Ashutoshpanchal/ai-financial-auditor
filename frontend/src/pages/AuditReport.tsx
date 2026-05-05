import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../services/api";
import { GraphifyPanel } from "../components/audit/GraphifyPanel";

interface AuditReportData {
  id: string;
  document_id: string;
  summary: string;
  insights: {
    categories: Record<string, number>;
    top_merchants: Array<{ name: string; category: string; total: number; count: number }>;
    anomalies: Array<{ description: string; date: string; amount: number; reason: string }>;
    recommendations: string[];
    monthly_totals: Record<string, number>;
    graph_html_path: string | null;
  };
  graph_json: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditReport() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<AuditReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<AuditReportData>(`/audit/${id}`)
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.response?.data?.detail ?? "Failed to load report"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!report) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4 flex items-center gap-4">
        <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</Link>
        <h1 className="text-lg font-semibold text-gray-800">Audit Report</h1>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Summary */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Summary</h2>
          <p className="text-gray-700 leading-relaxed">{report.summary}</p>
        </div>

        {/* Spending categories */}
        {Object.keys(report.insights.categories).length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Spending by Category</h2>
            <div className="space-y-3">
              {Object.entries(report.insights.categories)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{cat}</span>
                    <span className="font-semibold text-gray-900">${amount.toFixed(2)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Anomalies */}
        {report.insights.anomalies.length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-amber-100">
            <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-4">
              Anomalies Detected ({report.insights.anomalies.length})
            </h2>
            <div className="space-y-3">
              {report.insights.anomalies.map((a, i) => (
                <div key={i} className="rounded-lg bg-amber-50 p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-gray-800">{a.description}</p>
                    <span className="text-sm font-bold text-amber-700 ml-4">${a.amount.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{a.date} — {a.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {report.insights.recommendations.length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Recommendations</h2>
            <ul className="space-y-2">
              {report.insights.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-700">
                  <span className="text-green-500 font-bold mt-0.5">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Graphify Knowledge Graph */}
        <GraphifyPanel
          graphJson={report.graph_json}
          graphHtmlPath={report.insights.graph_html_path ?? null}
          documentId={report.document_id}
        />
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-red-500 text-sm">{message}</p>
    </div>
  );
}
