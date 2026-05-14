import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import axios from "axios";
import { createPortal, flushSync } from "react-dom";
import { api, fetchUnmapped, resolveUnmapped } from "../services/api";
import type { UnmappedEntry } from "../services/api";

// ─── Constants ───────────────────────────────────────────────────────────────

const DICT_PAGE_SIZE = 8;
const MAPPINGS_PAGE_SIZE = 10;
const UNMAPPED_PAGE_SIZE = 10;

/** Same fixed width for Category Dictionary and Description Mappings search fields */
const TABLE_SEARCH_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:w-80";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubEntry {
  id: string;
  sub_category: string;
  is_global?: boolean;
}

type MasterData = Record<string, SubEntry[]>;

interface MasterSplit {
  merged: MasterData;
  builtin: MasterData;
  user_defined: MasterData;
}

interface DescriptionMapping {
  id: string;
  description: string;
  parent_category: string | null;
  sub_category: string | null;
  payment_method: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface MasterFlatRow {
  id: string;
  parent_category: string;
  sub_category: string;
  is_global: boolean;
}

type DictionaryTab = "builtin" | "user_defined";

function formatAnalyzeApiError(err: unknown): string {
  const ax = err as { response?: { data?: { detail?: unknown } } };
  const d = ax.response?.data?.detail;
  if (typeof d === "string" && d.trim()) return d;
  return "Categorization failed. Please try again.";
}

/** True when the user aborted AI Sync (Cancel) or navigated away during the request. */
function wasRequestAborted(err: unknown): boolean {
  if (axios.isCancel(err)) return true;
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; name?: string };
    if (e.code === "ERR_CANCELED") return true;
    if (e.name === "CanceledError") return true;
  }
  return false;
}

// ─── Category colour map ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining": "bg-green-100 text-green-800",
  Entertainment: "bg-pink-100 text-pink-800",
  Shopping: "bg-purple-100 text-purple-800",
  Transport: "bg-blue-100 text-blue-800",
  Utilities: "bg-orange-100 text-orange-800",
  Healthcare: "bg-red-100 text-red-800",
  Education: "bg-yellow-100 text-yellow-800",
  "Rent & EMI": "bg-indigo-100 text-indigo-800",
  Income: "bg-emerald-100 text-emerald-800",
  Transfers: "bg-gray-100 text-gray-700",
  Other: "bg-slate-100 text-slate-700",
  "My Categories": "bg-violet-100 text-violet-800",
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

function PaginationBar(props: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  "aria-label"?: string;
}) {
  const { page, totalItems, pageSize, onPageChange, "aria-label": aria } = props;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100 text-xs text-gray-600"
      aria-label={aria}
    >
      <span>
        {totalItems === 0 ? "No rows" : `Showing ${from}–${to} of ${totalItems}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="px-2 tabular-nums">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function flashMappingSaved(
  id: string,
  setMappingSavedAt: Dispatch<SetStateAction<Record<string, number>>>,
) {
  setMappingSavedAt((m) => ({ ...m, [id]: Date.now() }));
  window.setTimeout(() => {
    setMappingSavedAt((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }, 2200);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Categories() {
  const [masterMerged, setMasterMerged] = useState<MasterData>({});
  const [masterBuiltin, setMasterBuiltin] = useState<MasterData>({});
  const [masterUser, setMasterUser] = useState<MasterData>({});
  const [descriptions, setDescriptions] = useState<DescriptionMapping[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeInfo, setAnalyzeInfo] = useState<string | null>(null);
  const [mutateError, setMutateError] = useState<string | null>(null);

  const [analyzeConfirmOpen, setAnalyzeConfirmOpen] = useState(false);

  const [dictionaryOpen, setDictionaryOpen] = useState(true);
  const [dictTab, setDictTab] = useState<DictionaryTab>("builtin");
  const [dictionarySearch, setDictionarySearch] = useState("");
  const [descriptionSearch, setDescriptionSearch] = useState("");
  const [dictPage, setDictPage] = useState(1);
  const [descPage, setDescPage] = useState(1);

  const [newParent, setNewParent] = useState("");
  const [newSub, setNewSub] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [editEntry, setEditEntry] = useState<MasterFlatRow | null>(null);
  const [editParent, setEditParent] = useState("");
  const [editSub, setEditSub] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [mappingSavedAt, setMappingSavedAt] = useState<Record<string, number>>({});

  // Unmapped short descriptions
  const [unmappedEntries, setUnmappedEntries] = useState<UnmappedEntry[]>([]);
  const [unmappedLoading, setUnmappedLoading] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<UnmappedEntry | null>(null);
  const [resolveParent, setResolveParent] = useState("");
  const [resolveSub, setResolveSub] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSaving, setResolveSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"dictionary" | "unmapped">("dictionary");
  const [unmappedSearch, setUnmappedSearch] = useState("");
  const [unmappedPage, setUnmappedPage] = useState(1);

  const analyzeAbortRef = useRef<AbortController | null>(null);

  const loadMaster = useCallback(async (signal?: AbortSignal) => {
    const res =
      signal !== undefined
        ? await api.get<MasterSplit>("/categories/master/split", { signal })
        : await api.get<MasterSplit>("/categories/master/split");
    setMasterMerged(res.data.merged);
    setMasterBuiltin(res.data.builtin);
    setMasterUser(res.data.user_defined);
  }, []);

  const loadDescriptions = useCallback(async (signal?: AbortSignal) => {
    const res =
      signal !== undefined
        ? await api.get<DescriptionMapping[]>("/categories/rules", { signal })
        : await api.get<DescriptionMapping[]>("/categories/rules");
    setDescriptions(Array.isArray(res.data) ? res.data : []);
  }, []);

  const loadPaymentMethods = useCallback(async () => {
    const res = await api.get<string[]>("/categories/payment-methods");
    setPaymentMethods(res.data);
  }, []);

  const loadUnmapped = useCallback(async () => {
    setUnmappedLoading(true);
    try {
      const entries = await fetchUnmapped();
      setUnmappedEntries(entries);
    } catch {
      // non-fatal: unmapped tab will just show empty
    } finally {
      setUnmappedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaster();
    loadDescriptions();
    loadPaymentMethods();
    loadUnmapped();
  }, [loadMaster, loadDescriptions, loadPaymentMethods, loadUnmapped]);

  useEffect(
    () => () => {
      analyzeAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    setDictPage(1);
  }, [dictionarySearch, dictTab]);

  useEffect(() => {
    setDescPage(1);
  }, [descriptionSearch]);

  useEffect(() => {
    setUnmappedPage(1);
  }, [unmappedSearch]);

  const activeDictionaryMaster: MasterData = dictTab === "builtin" ? masterBuiltin : masterUser;

  const masterFlatRows: MasterFlatRow[] = useMemo(() => {
    const rows: MasterFlatRow[] = [];
    const parents = Object.keys(activeDictionaryMaster).sort((a, b) => a.localeCompare(b));
    for (const parent of parents) {
      for (const entry of activeDictionaryMaster[parent] ?? []) {
        rows.push({
          id: entry.id,
          parent_category: parent,
          sub_category: entry.sub_category,
          is_global: entry.is_global !== false,
        });
      }
    }
    return rows;
  }, [activeDictionaryMaster]);

  /** Show dictionary + rules tables once master or rules data exists (not only when rules are non-empty). */
  const showFullCatalogUi = descriptions.length > 0 || masterFlatRows.length > 0;

  const filteredDictionaryRows = useMemo(() => {
    const q = dictionarySearch.trim().toLowerCase();
    if (!q) return masterFlatRows;
    return masterFlatRows.filter(
      (r) =>
        r.parent_category.toLowerCase().includes(q) ||
        r.sub_category.toLowerCase().includes(q),
    );
  }, [masterFlatRows, dictionarySearch]);

  const filteredDescriptions = useMemo(() => {
    const q = descriptionSearch.trim().toLowerCase();
    if (!q) return descriptions;
    return descriptions.filter((row) => {
      const d = (row.description ?? "").toLowerCase();
      const p = (row.parent_category ?? "").toLowerCase();
      const s = (row.sub_category ?? "").toLowerCase();
      return d.includes(q) || p.includes(q) || s.includes(q);
    });
  }, [descriptions, descriptionSearch]);

  const dictionaryPageRows = useMemo(() => {
    const start = (dictPage - 1) * DICT_PAGE_SIZE;
    return filteredDictionaryRows.slice(start, start + DICT_PAGE_SIZE);
  }, [filteredDictionaryRows, dictPage]);

  const descriptionsPageRows = useMemo(() => {
    const start = (descPage - 1) * MAPPINGS_PAGE_SIZE;
    return filteredDescriptions.slice(start, start + MAPPINGS_PAGE_SIZE);
  }, [filteredDescriptions, descPage]);

  const filteredUnmappedEntries = useMemo(() => {
    const q = unmappedSearch.trim().toLowerCase();
    if (!q) return unmappedEntries;
    return unmappedEntries.filter((e) => {
      const short = (e.short_description ?? "").toLowerCase();
      const rawBlob = (e.sample_raw_descriptions ?? [])
        .map((s) => (s ?? "").toLowerCase())
        .join("\n");
      return short.includes(q) || rawBlob.includes(q);
    });
  }, [unmappedEntries, unmappedSearch]);

  const unmappedPageRows = useMemo(() => {
    const start = (unmappedPage - 1) * UNMAPPED_PAGE_SIZE;
    return filteredUnmappedEntries.slice(start, start + UNMAPPED_PAGE_SIZE);
  }, [filteredUnmappedEntries, unmappedPage]);

  const parentOptions = Object.keys(masterMerged).sort();

  async function runAnalyze() {
    analyzeAbortRef.current?.abort();
    const ac = new AbortController();
    analyzeAbortRef.current = ac;
    flushSync(() => {
      setAnalyzing(true);
      setAnalyzeError(null);
      setAnalyzeInfo(null);
    });
    try {
      const analyzeUrl = api.getUri({ url: "/categories/analyze" });
      console.info("[AI-Sync] POST starting", analyzeUrl);
      const res = await api.post<{
        message: string;
        mapped: number;
        transactions_updated?: number;
      }>("/categories/analyze", {}, { signal: ac.signal });
      const tx = res.data.transactions_updated ?? 0;
      const mapped = res.data.mapped ?? 0;
      const message = res.data.message ?? "Done";
      const summary = `${message} — ${mapped} rules saved, ${tx} transactions categorized.`;
      try {
        await Promise.all([loadDescriptions(ac.signal), loadMaster(ac.signal)]);
      } catch (reloadErr) {
        if (wasRequestAborted(reloadErr)) {
          setAnalyzeInfo("AI Sync was cancelled before the list finished refreshing.");
        } else {
          setAnalyzeInfo(`${summary} (Could not reload the list — try opening this page again.)`);
        }
      }
    } catch (err) {
      if (wasRequestAborted(err)) {
        setAnalyzeInfo("AI Sync was cancelled.");
      } else {
        setAnalyzeError(formatAnalyzeApiError(err));
      }
    } finally {
      if (analyzeAbortRef.current === ac) {
        analyzeAbortRef.current = null;
      }
      setAnalyzing(false);
    }
  }

  async function handleAddSub() {
    setAddError(null);
    const parent = newParent.trim();
    const sub = newSub.trim();
    if (!parent || !sub) {
      setAddError("Both fields are required.");
      return;
    }
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
      await Promise.all([loadMaster(), loadDescriptions()]);
    } catch {
      setMutateError("Failed to delete entry — only categories you created can be removed.");
    }
  }

  function openEditModal(row: MasterFlatRow) {
    setEditError(null);
    setEditEntry(row);
    setEditParent(row.parent_category);
    setEditSub(row.sub_category);
  }

  async function handleSaveEdit() {
    if (!editEntry) return;
    setEditError(null);
    const parent = editParent.trim();
    const sub = editSub.trim();
    if (!parent || !sub) {
      setEditError("Both parent and sub-category are required.");
      return;
    }
    setEditSaving(true);
    try {
      await api.patch(`/categories/master/${editEntry.id}`, {
        parent_category: parent,
        sub_category: sub,
      });
      setEditEntry(null);
      await Promise.all([loadMaster(), loadDescriptions()]);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEditError(msg ?? "Failed to save rename.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleUpdateMapping(
    id: string,
    field: "parent_category" | "sub_category" | "payment_method",
    value: string,
  ) {
    setMutateError(null);
    try {
      await api.patch(`/categories/rules/${id}`, { [field]: value });
      setDescriptions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
      );
      flashMappingSaved(id, setMappingSavedAt);
    } catch {
      setMutateError("Failed to save change — please try again.");
    }
  }

  function openResolveModal(entry: UnmappedEntry) {
    setResolveError(null);
    setResolveTarget(entry);
    setResolveParent("");
    setResolveSub("");
    setResolveModalOpen(true);
  }

  async function handleResolveUnmapped() {
    if (!resolveTarget) return;
    setResolveError(null);
    const parent = resolveParent.trim();
    const sub = resolveSub.trim();
    if (!parent || !sub) {
      setResolveError("Both parent and sub-category are required.");
      return;
    }
    setResolveSaving(true);
    try {
      await resolveUnmapped(resolveTarget.short_description, parent, sub);
      setResolveModalOpen(false);
      setResolveTarget(null);
      await Promise.all([loadUnmapped(), loadMaster(), loadDescriptions()]);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setResolveError(msg ?? "Failed to save — please try again.");
    } finally {
      setResolveSaving(false);
    }
  }

  async function handleParentChange(row: DescriptionMapping, value: string) {
    setMutateError(null);
    try {
      await api.patch(`/categories/rules/${row.id}`, {
        parent_category: value,
        sub_category: null,
      });
      setDescriptions((prev) =>
        prev.map((d) =>
          d.id === row.id ? { ...d, parent_category: value, sub_category: null } : d,
        ),
      );
      flashMappingSaved(row.id, setMappingSavedAt);
    } catch {
      setMutateError("Failed to save change — please try again.");
    }
  }

  useEffect(() => {
    setUnmappedPage((p) => {
      const totalPages = Math.max(1, Math.ceil(filteredUnmappedEntries.length / UNMAPPED_PAGE_SIZE));
      return p > totalPages ? totalPages : p;
    });
  }, [filteredUnmappedEntries.length]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Category Manager</h1>

      {mutateError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {mutateError}
        </div>
      )}

      {analyzeError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {analyzeError}
        </div>
      )}

      {analyzeInfo && (
        <div className="mb-4 bg-slate-100 border border-slate-200 text-slate-800 text-sm rounded-lg px-4 py-2">
          {analyzeInfo}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!showFullCatalogUi && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-6 min-h-[40vh] mb-8 flex flex-col justify-center">
          <p className="text-gray-700 font-medium mb-2">No category data yet</p>
          <p className="text-sm text-gray-600 max-w-xl">
            Upload a statement or add dictionary entries. Data loads automatically when you open this page.
          </p>
        </div>
      )}

      {/* ── Full-width dictionary (collapsible) + mappings ───────────────── */}
      {showFullCatalogUi && (
        <div className="flex flex-col gap-8">
          {/* Tab bar: Dictionary | Unmapped */}
          <div className="flex items-center gap-1 border-b border-gray-200">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dictionary"}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === "dictionary"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
              onClick={() => setActiveTab("dictionary")}
            >
              Category Dictionary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "unmapped"}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                activeTab === "unmapped"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
              onClick={() => setActiveTab("unmapped")}
            >
              Unmapped
              {unmappedEntries.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                  {unmappedEntries.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Unmapped tab ─────────────────────────────────────────────── */}
          {activeTab === "unmapped" && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-800">
                  Unmapped Merchants
                  {unmappedEntries.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({unmappedEntries.length} unique ·{" "}
                      {unmappedEntries.reduce((s, e) => s + e.txn_count, 0)} transactions)
                    </span>
                  )}
                </h2>
              </div>

              {unmappedEntries.length > 0 && (
                <div className="mb-4 flex flex-wrap items-end justify-end gap-3">
                  <div className="w-full sm:w-80 sm:shrink-0">
                    <label htmlFor="unmapped-search" className="sr-only">
                      Search short or raw description
                    </label>
                    <input
                      id="unmapped-search"
                      type="search"
                      placeholder="Search short description or raw sample…"
                      value={unmappedSearch}
                      onChange={(e) => setUnmappedSearch(e.target.value)}
                      className={TABLE_SEARCH_INPUT_CLASS}
                    />
                  </div>
                </div>
              )}

              {unmappedLoading && unmappedEntries.length === 0 ? (
                <p className="text-center py-12 text-gray-500 text-sm">Loading…</p>
              ) : unmappedEntries.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-sm">All merchants are categorized 🎉</p>
                  <p className="text-gray-400 text-xs mt-1">
                    Upload a new statement to see unmapped merchants here.
                  </p>
                </div>
              ) : filteredUnmappedEntries.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No unmapped rows match your search.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-base min-w-[48rem]">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                          <th className="pb-2 pr-4 font-medium">Short Description</th>
                          <th className="pb-2 pr-4 font-medium w-20">Count</th>
                          <th className="pb-2 pr-4 font-medium">Raw description samples</th>
                          <th className="pb-2 font-medium text-right w-36">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {unmappedPageRows.map((entry) => {
                          const rawJoined = (entry.sample_raw_descriptions ?? [])
                            .filter((s) => (s ?? "").trim() !== "")
                            .join(" · ");
                          const rawDisplay = rawJoined.length > 0 ? rawJoined : "—";
                          return (
                            <tr key={entry.short_description} className="hover:bg-gray-50">
                              <td className="py-3 pr-4">
                                <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                                  {entry.short_description}
                                </code>
                              </td>
                              <td className="py-3 pr-4 text-gray-700 font-medium">{entry.txn_count}</td>
                              <td
                                className="py-3 pr-4 text-sm text-gray-500 max-w-md align-top"
                                title={rawDisplay !== "—" ? rawDisplay : undefined}
                              >
                                <span className="line-clamp-2 break-words">{rawDisplay}</span>
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => openResolveModal(entry)}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50"
                                >
                                  Add Category
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={unmappedPage}
                    totalItems={filteredUnmappedEntries.length}
                    pageSize={UNMAPPED_PAGE_SIZE}
                    onPageChange={setUnmappedPage}
                    aria-label="Unmapped merchants pagination"
                  />
                </>
              )}
            </section>
          )}

          {/* ── Dictionary tab ──────────────────────────────────────────── */}
          {activeTab === "dictionary" && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDictionaryOpen((v) => !v)}
                className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-expanded={dictionaryOpen}
                aria-label={dictionaryOpen ? "Collapse category dictionary" : "Expand category dictionary"}
                title={dictionaryOpen ? "Collapse" : "Expand"}
              >
                <svg
                  className={`h-5 w-5 transition-transform ${dictionaryOpen ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-800">Category Dictionary</h2>
            </div>

            {dictionaryOpen && (
              <>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div
                    className="flex min-w-0 gap-1 border-b border-gray-200"
                    role="tablist"
                    aria-label="Dictionary source"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dictTab === "builtin"}
                      className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium -mb-px ${
                        dictTab === "builtin"
                          ? "border-gray-200 bg-white text-indigo-700"
                          : "border-transparent text-gray-500 hover:text-gray-800"
                      }`}
                      onClick={() => setDictTab("builtin")}
                    >
                      Built-in
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dictTab === "user_defined"}
                      className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium -mb-px ${
                        dictTab === "user_defined"
                          ? "border-gray-200 bg-white text-indigo-700"
                          : "border-transparent text-gray-500 hover:text-gray-800"
                      }`}
                      onClick={() => setDictTab("user_defined")}
                    >
                      User-defined
                    </button>
                  </div>
                  <div className="w-full sm:w-80 sm:shrink-0">
                    <label htmlFor="dictionary-search" className="sr-only">
                      Search dictionary
                    </label>
                    <input
                      id="dictionary-search"
                      type="search"
                      placeholder="Search parent or sub-category…"
                      value={dictionarySearch}
                      onChange={(e) => setDictionarySearch(e.target.value)}
                      className={TABLE_SEARCH_INPUT_CLASS}
                    />
                  </div>
                </div>

                {dictTab === "user_defined" && (
                  <div className="flex flex-wrap items-end gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Parent category"
                      value={newParent}
                      onChange={(e) => setNewParent(e.target.value)}
                      list="parent-options-dict"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <datalist id="parent-options-dict">
                      {parentOptions.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <input
                      type="text"
                      placeholder="Sub-category"
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddSub}
                      className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 shrink-0"
                    >
                      Add
                    </button>
                  </div>
                )}
                {dictTab === "user_defined" && addError && (
                  <p className="text-red-500 text-sm mb-2">{addError}</p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-base min-w-[40rem]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                        <th className="pb-2 pr-4 font-medium">Parent</th>
                        <th className="pb-2 pr-4 font-medium">Sub</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        {dictTab === "user_defined" ? (
                          <th className="pb-2 font-medium text-right w-32">Actions</th>
                        ) : (
                          <th className="pb-2 w-8" />
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dictionaryPageRows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 align-top">
                            <CategoryBadge value={r.parent_category} />
                          </td>
                          <td className="py-2.5 pr-4 text-gray-800 align-top">{r.sub_category}</td>
                          <td className="py-2.5 pr-4 text-sm text-gray-600 align-top">
                            {r.is_global ? "Built-in" : "User-defined"}
                          </td>
                          <td className="py-2.5 text-right align-top">
                            {dictTab === "user_defined" && !r.is_global && (
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(r)}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded border border-indigo-200 hover:bg-indigo-50"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSub(r.id)}
                                  className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredDictionaryRows.length === 0 && (
                    <p className="text-gray-400 text-sm py-6 text-center">
                      No dictionary rows match your search.
                    </p>
                  )}
                </div>
                <PaginationBar
                  page={dictPage}
                  totalItems={filteredDictionaryRows.length}
                  pageSize={DICT_PAGE_SIZE}
                  onPageChange={setDictPage}
                  aria-label="Dictionary pagination"
                />
              </>
            )}
          </section>
          )}

          {/* ── Category rules — hidden from UI; change outer `false` to `true` to restore ─ */}
          {false && activeTab === "dictionary" && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-800">
                Category rules
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({descriptions.length} entries)
                </span>
              </h2>
              <div className="w-full sm:w-80 sm:shrink-0">
                <label htmlFor="mappings-search" className="sr-only">
                  Search mappings
                </label>
                <input
                  id="mappings-search"
                  type="search"
                  placeholder="Search description, parent, or sub…"
                  value={descriptionSearch}
                  onChange={(e) => setDescriptionSearch(e.target.value)}
                  className={TABLE_SEARCH_INPUT_CLASS}
                />
              </div>
            </div>

            {filteredDescriptions.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No rows match your search.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-base min-w-[56rem] table-fixed">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[13%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="pb-2 pr-3 font-medium">Pattern</th>
                      <th className="pb-2 pr-3 font-medium">Category</th>
                      <th className="pb-2 pr-3 font-medium">Sub-category</th>
                      <th className="pb-2 pr-3 font-medium">Payment Method</th>
                      <th className="pb-2 pr-3 font-medium">Last Updated</th>
                      <th className="pb-2 pr-2 font-medium">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {descriptionsPageRows.map((row) => {
                      const subOptions = row.parent_category
                        ? (masterMerged[row.parent_category] ?? [])
                        : [];
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 align-top">
                          <td className="py-3 pr-3 text-gray-800 whitespace-normal break-words leading-snug">
                            {row.description}
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              value={row.parent_category ?? ""}
                              onChange={(e) => handleParentChange(row, e.target.value)}
                              className="w-full min-w-0 border border-gray-200 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                            >
                              <option value="">—</option>
                              {parentOptions.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              value={row.sub_category ?? ""}
                              onChange={(e) =>
                                handleUpdateMapping(row.id, "sub_category", e.target.value)
                              }
                              disabled={!row.parent_category}
                              className="w-full min-w-0 border border-gray-200 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:opacity-40"
                            >
                              <option value="">—</option>
                              {subOptions.map((s) => (
                                <option key={s.id} value={s.sub_category}>
                                  {s.sub_category}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              value={row.payment_method ?? ""}
                              onChange={(e) =>
                                handleUpdateMapping(row.id, "payment_method", e.target.value)
                              }
                              className="w-full min-w-0 border border-gray-200 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                            >
                              <option value="">—</option>
                              {paymentMethods.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3 text-sm text-gray-500 whitespace-nowrap">
                            {row.updated_at
                              ? new Date(row.updated_at).toLocaleDateString()
                              : "AI"}
                          </td>
                          <td className="py-3 pr-2 text-sm">
                            {mappingSavedAt[row.id] ? (
                              <span className="text-green-600 font-medium">Saved</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={descPage}
              totalItems={filteredDescriptions.length}
              pageSize={MAPPINGS_PAGE_SIZE}
              onPageChange={setDescPage}
              aria-label="Mappings pagination"
            />
          </section>
          )}
        </div>
      )}

      {/* Rename modal */}
      {editEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !editSaving && setEditEntry(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-dict-title"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="rename-dict-title" className="text-lg font-semibold text-gray-900 mb-3">
              Rename category
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Updates your dictionary entry and any category rules that used this parent and sub-category.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="edit-parent" className="block text-xs font-medium text-gray-600 mb-1">
                  Parent category
                </label>
                <input
                  id="edit-parent"
                  type="text"
                  value={editParent}
                  onChange={(e) => setEditParent(e.target.value)}
                  list="parent-options-edit"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <datalist id="parent-options-edit">
                  {parentOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="edit-sub" className="block text-xs font-medium text-gray-600 mb-1">
                  Sub-category
                </label>
                <input
                  id="edit-sub"
                  type="text"
                  value={editSub}
                  onChange={(e) => setEditSub(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
            {editError && <p className="text-red-500 text-sm mt-3">{editError}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={editSaving}
                onClick={() => setEditEntry(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={editSaving}
                onClick={() => void handleSaveEdit()}
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-run confirmation — portaled so no parent stacking context can hide it */}
      {typeof document !== "undefined" &&
        analyzeConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
            role="presentation"
            onClick={() => setAnalyzeConfirmOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="analyze-confirm-title"
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="analyze-confirm-title" className="text-lg font-semibold text-gray-900 mb-2">
                Re-run AI Sync?
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                The AI will process your transaction descriptions again,{" "}
                <strong>update</strong> category rules and payment suggestions. It then applies rules to
                uncategorized transactions. Your manual edits may be overwritten where the model returns a
                new value for the same description pattern.
              </p>
              <p className="text-xs text-gray-500 mb-4">
                After you click Continue, the app sends{" "}
                <code className="rounded bg-gray-100 px-1">POST /categories/analyze</code> (check the{" "}
                <strong>browser</strong> Network tab — Docker container logs alone will not show this
                request).
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50"
                  onClick={() => setAnalyzeConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setAnalyzeConfirmOpen(false);
                    void runAnalyze();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Resolve unmapped modal */}
      {resolveModalOpen && resolveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !resolveSaving && setResolveModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-unmapped-title"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="resolve-unmapped-title" className="text-lg font-semibold text-gray-900 mb-2">
              Add Category
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Assign a category to{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
                {resolveTarget.short_description}
              </code>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              This will categorize {resolveTarget.txn_count} transaction{resolveTarget.txn_count !== 1 ? "s" : ""}.
              {resolveTarget.sample_raw_descriptions[0] && (
                <> Example: <span className="italic">{resolveTarget.sample_raw_descriptions[0]}</span></>
              )}
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="resolve-parent" className="block text-xs font-medium text-gray-600 mb-1">
                  Parent category
                </label>
                <input
                  id="resolve-parent"
                  type="text"
                  value={resolveParent}
                  onChange={(e) => setResolveParent(e.target.value)}
                  list="parent-options-resolve"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Food & Dining"
                />
                <datalist id="parent-options-resolve">
                  {parentOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="resolve-sub" className="block text-xs font-medium text-gray-600 mb-1">
                  Sub-category
                </label>
                <input
                  id="resolve-sub"
                  type="text"
                  value={resolveSub}
                  onChange={(e) => setResolveSub(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Zomato"
                />
              </div>
            </div>
            {resolveError && <p className="text-red-500 text-sm mt-3">{resolveError}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={resolveSaving}
                onClick={() => setResolveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={resolveSaving}
                onClick={() => void handleResolveUnmapped()}
              >
                {resolveSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {analyzing ? (
        <span className="sr-only" aria-live="polite">
          Syncing categories
        </span>
      ) : null}

    </div>
  );
}
