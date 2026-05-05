import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  filename: string;
  bank_name: string;
  file_type: string;
  status: "uploaded" | "parsing" | "parsed" | "embedding" | "auditing" | "completed" | "failed";
  upload_date: string;
  error_message?: string;
}

interface AuditReport {
  id: string;
  document_id: string;
  summary: string;
  insights: {
    total_spend?: number;
    top_category?: string;
    anomaly_count?: number;
    monthly_totals?: { month: string; total: number }[];
    categories?: { name: string; value: number }[];
  };
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];

const STATUS_BADGE: Record<
  Document["status"],
  { label: string; classes: string }
> = {
  uploaded:  { label: "Uploaded",  classes: "bg-blue-100 text-blue-700" },
  parsing:   { label: "Parsing",   classes: "bg-yellow-100 text-yellow-700" },
  parsed:    { label: "Parsed",    classes: "bg-yellow-100 text-yellow-700" },
  embedding: { label: "Embedding", classes: "bg-yellow-100 text-yellow-700" },
  auditing:  { label: "Auditing",  classes: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completed", classes: "bg-green-100 text-green-700" },
  failed:    { label: "Failed",    classes: "bg-red-100 text-red-700" },
};

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
      <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-20 bg-gray-300 rounded" />
    </div>
  );
}

function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div
      className="bg-white rounded-2xl p-6 shadow-sm animate-pulse"
      style={{ height: height + 80 }}
    >
      <div className="h-4 w-36 bg-gray-200 rounded mb-4" />
      <div className="bg-gray-100 rounded-xl" style={{ height }} />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="p-6 border-b border-gray-100">
        <div className="h-5 w-32 bg-gray-200 rounded" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-6 py-4">
            <div className="h-4 w-40 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-8">
          <span className="text-lg font-bold text-indigo-600 tracking-tight">FinanceAI</span>
          <div className="hidden sm:flex items-center gap-1">
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/upload">Upload</NavLink>
            <NavLink to="/chat">Chat</NavLink>
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user?.picture && (
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
          )}
          <span className="text-sm text-gray-600 hidden sm:block">{user?.name}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
    >
      {children}
    </Link>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color = "indigo",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "indigo" | "emerald" | "amber" | "red";
}) {
  const colorMap = {
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [audits, setAudits] = useState<AuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [docsRes, auditsRes] = await Promise.all([
          api.get<Document[]>("/documents"),
          api.get<AuditReport[]>("/audit"),
        ]);
        setDocuments(docsRes.data);
        setAudits(auditsRes.data);
      } catch (err: any) {
        setError(err?.response?.data?.detail ?? "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const latestAudit = audits[0] ?? null;
  const totalSpend = latestAudit?.insights?.total_spend ?? null;
  const topCategory = latestAudit?.insights?.top_category ?? null;
  const anomalyCount = latestAudit?.insights?.anomaly_count ?? null;
  const monthlyData: { month: string; total: number }[] =
    latestAudit?.insights?.monthly_totals ?? [];
  const categoryData: { name: string; value: number }[] =
    latestAudit?.insights?.categories ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Your AI-powered finance audit at a glance</p>
        </div>

        {/* Summary cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Total Spend (latest)"
              value={totalSpend !== null ? `$${totalSpend.toLocaleString()}` : "—"}
              sub="from most recent audit"
              color="indigo"
            />
            <SummaryCard
              label="Top Category"
              value={topCategory ?? "—"}
              sub="highest spend bucket"
              color="emerald"
            />
            <SummaryCard
              label="Anomalies Detected"
              value={anomalyCount !== null ? anomalyCount : "—"}
              sub="unusual transactions flagged"
              color={anomalyCount && anomalyCount > 0 ? "red" : "amber"}
            />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <>
              <SkeletonChart height={240} />
              <SkeletonChart height={240} />
            </>
          ) : (
            <>
              {/* Monthly Bar Chart */}
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Monthly Spend</h2>
                {monthlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(v: number) => [`$${v.toLocaleString()}`, "Spend"]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 16px rgba(0,0,0,.08)",
                        }}
                      />
                      <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No monthly data yet. Upload a bank statement to get started." />
                )}
              </div>

              {/* Category Pie Chart */}
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Spend by Category</h2>
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={48}
                        paddingAngle={2}
                      >
                        {categoryData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [`$${v.toLocaleString()}`, "Spend"]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 16px rgba(0,0,0,.08)",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(val: string) => (
                          <span style={{ fontSize: 12, color: "#6b7280" }}>{val}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No category data yet." />
                )}
              </div>
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
            {error}
          </div>
        )}

        {/* Recent Audits table */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Recent Audit Reports</h2>
          {loading ? (
            <SkeletonTable rows={4} />
          ) : audits.length === 0 ? (
            <EmptyState message="No audits yet. Upload a document to generate your first report." />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <Th>Summary</Th>
                    <Th>Total Spend</Th>
                    <Th>Anomalies</Th>
                    <Th>Date</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {audits.slice(0, 8).map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                        {a.summary}
                      </td>
                      <Td>
                        {a.insights?.total_spend != null
                          ? `$${a.insights.total_spend.toLocaleString()}`
                          : "—"}
                      </Td>
                      <Td>{a.insights?.anomaly_count ?? "—"}</Td>
                      <Td>{new Date(a.created_at).toLocaleDateString()}</Td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/audit/${a.id}`}
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                          View Report
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Uploads table */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Recent Uploads</h2>
          {loading ? (
            <SkeletonTable rows={4} />
          ) : documents.length === 0 ? (
            <EmptyState
              message="No documents uploaded yet."
              action={{ label: "Upload now", to: "/upload" }}
            />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <Th>File</Th>
                    <Th>Bank</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Uploaded</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {documents.slice(0, 8).map((doc) => {
                    const badge = STATUS_BADGE[doc.status] ?? {
                      label: doc.status,
                      classes: "bg-gray-100 text-gray-600",
                    };
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-800 font-medium max-w-xs truncate">
                          {doc.filename}
                        </td>
                        <Td>{doc.bank_name}</Td>
                        <Td>
                          <span className="uppercase text-xs font-semibold text-gray-500">
                            {doc.file_type}
                          </span>
                        </Td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <Td>{new Date(doc.upload_date).toLocaleDateString()}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-6 py-4 text-sm text-gray-600">{children}</td>;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400 text-center px-4">
      {message}
    </div>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-10 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-gray-500">{message}</p>
      {action && (
        <Link
          to={action.to}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
