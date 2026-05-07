import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubEntry {
  id: string;
  sub_category: string;
}

type MasterData = Record<string, SubEntry[]>;

interface DescriptionMapping {
  id: string;
  description: string;
  parent_category: string | null;
  sub_category: string | null;
  payment_method: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

// ─── Category colour map ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining":  "bg-green-100 text-green-800",
  Entertainment:    "bg-pink-100 text-pink-800",
  Shopping:         "bg-purple-100 text-purple-800",
  Transport:        "bg-blue-100 text-blue-800",
  Utilities:        "bg-orange-100 text-orange-800",
  Healthcare:       "bg-red-100 text-red-800",
  Education:        "bg-yellow-100 text-yellow-800",
  "Rent & EMI":     "bg-indigo-100 text-indigo-800",
  Income:           "bg-emerald-100 text-emerald-800",
  Transfers:        "bg-gray-100 text-gray-700",
  Other:            "bg-slate-100 text-slate-700",
};

function CategoryBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400 text-sm">—</span>;
  const cls = CATEGORY_COLORS[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Categories() {
  const [master, setMaster] = useState<MasterData>({});
  const [descriptions, setDescriptions] = useState<DescriptionMapping[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [mutateError, setMutateError] = useState<string | null>(null);

  // Add-sub-category form
  const [newParent, setNewParent] = useState("");
  const [newSub, setNewSub] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // ── loaders ──────────────────────────────────────────────────────────────

  const loadMaster = useCallback(async () => {
    const res = await api.get<MasterData>("/categories/master");
    setMaster(res.data);
  }, []);

  const loadDescriptions = useCallback(async () => {
    const res = await api.get<DescriptionMapping[]>("/categories/descriptions");
    setDescriptions(res.data);
  }, []);

  const loadPaymentMethods = useCallback(async () => {
    const res = await api.get<string[]>("/categories/payment-methods");
    setPaymentMethods(res.data);
  }, []);

  useEffect(() => {
    loadMaster();
    loadDescriptions();
    loadPaymentMethods();
  }, [loadMaster, loadDescriptions, loadPaymentMethods]);

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await api.post<{ message: string; mapped: number }>("/categories/analyze");
      setAnalyzeMsg(`${res.data.message} — ${res.data.mapped} descriptions mapped.`);
      await loadDescriptions();
    } catch {
      setAnalyzeMsg("Categorization failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAddSub() {
    setAddError(null);
    const parent = newParent.trim();
    const sub = newSub.trim();
    if (!parent || !sub) { setAddError("Both fields are required."); return; }
    try {
      await api.post("/categories/master", { parent_category: parent, sub_category: sub });
      setNewParent("");
      setNewSub("");
      await loadMaster();
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAddError(msg ?? "Failed to add entry.");
    }
  }

  async function handleDeleteSub(id: string) {
    setMutateError(null);
    try {
      await api.delete(`/categories/master/${id}`);
      await loadMaster();
    } catch {
      setMutateError("Failed to delete entry. You may need admin permissions.");
    }
  }

  async function handleUpdateMapping(
    id: string,
    field: "parent_category" | "sub_category" | "payment_method",
    value: string,
  ) {
    setMutateError(null);
    try {
      await api.patch(`/categories/descriptions/${id}`, { [field]: value });
      setDescriptions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
      );
    } catch {
      setMutateError("Failed to save change — please try again.");
    }
  }

  // When parent changes, reset sub_category for that row
  async function handleParentChange(row: DescriptionMapping, value: string) {
    setMutateError(null);
    try {
      await api.patch(`/categories/descriptions/${row.id}`, {
        parent_category: value,
        sub_category: null,
      });
      setDescriptions((prev) =>
        prev.map((d) =>
          d.id === row.id ? { ...d, parent_category: value, sub_category: null } : d,
        ),
      );
    } catch {
      setMutateError("Failed to save change — please try again.");
    }
  }

  const parentOptions = Object.keys(master).sort();

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Category Manager</h1>
      {mutateError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {mutateError}
        </div>
      )}

      {/* ── Section 1: Category Dictionary ──────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Category Dictionary</h2>

        <div className="space-y-4">
          {parentOptions.map((parent) => (
            <div key={parent}>
              <div className="flex items-center gap-2 mb-2">
                <CategoryBadge value={parent} />
              </div>
              <div className="flex flex-wrap gap-2 pl-2">
                {master[parent].map((entry) => (
                  <span
                    key={entry.id}
                    className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full"
                  >
                    {entry.sub_category}
                    <button
                      onClick={() => handleDeleteSub(entry.id)}
                      className="ml-1 text-gray-400 hover:text-red-500 font-bold leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add new sub-category */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Parent category (e.g. Food & Dining)"
            value={newParent}
            onChange={(e) => setNewParent(e.target.value)}
            list="parent-options"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <datalist id="parent-options">
            {parentOptions.map((p) => <option key={p} value={p} />)}
          </datalist>
          <input
            type="text"
            placeholder="Sub-category (e.g. Blinkit)"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={handleAddSub}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Add
          </button>
          {addError && <span className="text-red-500 text-sm">{addError}</span>}
        </div>
      </section>

      {/* ── Section 2: Description Mappings ─────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Description Mappings
            {descriptions.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({descriptions.length} entries)
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {analyzeMsg && (
              <span className="text-sm text-green-600">{analyzeMsg}</span>
            )}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {analyzing && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {analyzing ? "Analyzing…" : "Auto-Categorize"}
            </button>
          </div>
        </div>

        {descriptions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">
            No mappings yet — click <strong>Auto-Categorize</strong> to let the AI classify your transaction descriptions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-3 pr-4 font-medium">Description</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 font-medium">Sub-category</th>
                  <th className="pb-3 pr-4 font-medium">Payment Method</th>
                  <th className="pb-3 font-medium">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {descriptions.map((row) => {
                  const subOptions = row.parent_category
                    ? (master[row.parent_category] ?? [])
                    : [];
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono text-xs text-gray-700 max-w-xs truncate">
                        {row.description}
                      </td>

                      {/* Parent category dropdown */}
                      <td className="py-3 pr-4">
                        <select
                          value={row.parent_category ?? ""}
                          onChange={(e) => handleParentChange(row, e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        >
                          <option value="">— select —</option>
                          {parentOptions.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>

                      {/* Sub-category dropdown — filtered by parent */}
                      <td className="py-3 pr-4">
                        <select
                          value={row.sub_category ?? ""}
                          onChange={(e) =>
                            handleUpdateMapping(row.id, "sub_category", e.target.value)
                          }
                          disabled={!row.parent_category}
                          className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white disabled:opacity-40"
                        >
                          <option value="">— select —</option>
                          {subOptions.map((s) => (
                            <option key={s.id} value={s.sub_category}>{s.sub_category}</option>
                          ))}
                        </select>
                      </td>

                      {/* Payment method dropdown */}
                      <td className="py-3 pr-4">
                        <select
                          value={row.payment_method ?? ""}
                          onChange={(e) =>
                            handleUpdateMapping(row.id, "payment_method", e.target.value)
                          }
                          className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        >
                          <option value="">— select —</option>
                          {paymentMethods.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </td>

                      {/* Last updated */}
                      <td className="py-3 text-xs text-gray-400">
                        {row.updated_at
                          ? new Date(row.updated_at).toLocaleDateString()
                          : "AI"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
