import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-700">AI Financial Auditor</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Your Financial Overview</h2>

        {/* Placeholder cards — will populate from audit data */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {["Total Spent", "Top Category", "Anomalies Detected"].map((label) => (
            <div key={label} className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-gray-300">—</p>
            </div>
          ))}
        </div>

        {/* TODO: Add Recharts spending chart + recent audits list */}
      </main>
    </div>
  );
}
