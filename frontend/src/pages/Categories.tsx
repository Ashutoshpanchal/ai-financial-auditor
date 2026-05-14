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

interface MappedCategory {
  parent_category: string;
  sub_category: string;
  txn_count: number;
}

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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

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
  const [activeTab, setActiveTab] = useState<"dictionary" | "unmapped" | "mapped">("dictionary");
  const [unmappedSearch, setUnmappedSearch] = useState("");
  const [unmappedPage, setUnmappedPage] = useState(1);
  const [mappedCategories, setMappedCategories] = useState<MappedCategory[]>([]);
  const [mappedSearch, setMappedSearch] = useState("");
  const [selectedUnmapped, setSelectedUnmapped] = useState<Set<string>>(new Set());
  const [bulkParent, setBulkParent] = useState("");
  const [bulkSub, setBulkSub] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [showBulkControls, setShowBulkControls] = useState(false);

  // Split-pane state for dictionary
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    if (typeof window === "undefined") return 400;
    return Math.max(window.innerWidth * 0.4, 300);
  });
  const [isDragging, setIsDragging] = useState(false);

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

  const loadMapped = useCallback(async () => {
    try {
      const res = await api.get<MappedCategory[]>("/categories/mapped");
      setMappedCategories(Array.isArray(res.data) ? res.data : []);
    } catch {
      // non-fatal: mapped tab will just show empty
    }
  }, []);

  useEffect(() => {
    loadMaster();
    loadDescriptions();
    loadPaymentMethods();
    loadUnmapped();
    loadMapped();
  }, [loadMaster, loadDescriptions, loadPaymentMethods, loadUnmapped, loadMapped]);

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
  const showFullCatalogUi = descriptions.length > 0 || Object.keys(masterMerged).length > 0;

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
    setAddSaving(true);
    try {
      await api.post("/categories/master", { parent_category: parent, sub_category: sub });
      setNewParent("");
      setNewSub("");
      setAddModalOpen(false);
      await loadMaster();
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAddError(msg ?? "Failed to add entry.");
    } finally {
      setAddSaving(false);
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
      await resolveUnmapped(resolveTarget.short_description, parent, capitalizeWords(sub));
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

  async function handleBulkApply() {
    if (selectedUnmapped.size === 0 || !bulkParent || !bulkSub) {
      setBulkError("Select entries and choose category.");
      return;
    }
    setBulkApplying(true);
    setBulkError(null);
    try {
      const capitalizedSub = capitalizeWords(bulkSub);
      const tasks = Array.from(selectedUnmapped).map((shortDesc) =>
        resolveUnmapped(shortDesc, bulkParent, capitalizedSub)
      );
      await Promise.all(tasks);
      setSelectedUnmapped(new Set());
      setBulkParent("");
      setBulkSub("");
      await Promise.all([loadUnmapped(), loadMaster(), loadDescriptions()]);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setBulkError(msg ?? "Failed to categorize.");
    } finally {
      setBulkApplying(false);
    }
  }

  function capitalizeWords(str: string): string {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
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

  // Split-pane handlers
  const MIN_PANE_WIDTH = 300;

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const container = document.querySelector("[data-categories-container]");
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newLeftWidth = e.clientX - containerRect.left;

      const constrainedWidth = Math.max(
        MIN_PANE_WIDTH,
        Math.min(newLeftWidth, containerRect.width - MIN_PANE_WIDTH)
      );

      setLeftPaneWidth(constrainedWidth);
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col h-screen" data-categories-container>
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Category Dictionary</h1>
      </div>

      {/* Error messages */}
      {mutateError && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {mutateError}
        </div>
      )}

      {analyzeError && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {analyzeError}
        </div>
      )}

      {/* Empty state */}
      {!showFullCatalogUi && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-6 flex flex-col justify-center text-center">
            <p className="text-gray-700 font-medium mb-2">No category data yet</p>
            <p className="text-sm text-gray-600 max-w-xl">
              Upload a statement or add dictionary entries. Data loads automatically when you open this page.
            </p>
          </div>
        </div>
      )}

      {/* Split-pane dictionary */}
      {showFullCatalogUi && (
        <div className="flex-1 grid" style={{ gridTemplateColumns: `${leftPaneWidth}px 4px 1fr`, gap: 0 }}>
          {/* LEFT PANE: Built-in */}
          <div className="overflow-y-auto border-r border-gray-200 bg-white">
            <div className="p-4 sm:p-6 space-y-4">

          {/* ── Unmapped tab ─────────────────────────────────────────────── */}
          {activeTab === "unmapped" && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Unmapped Merchants
                  {unmappedEntries.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({unmappedEntries.length} unique ·{" "}
                      {unmappedEntries.reduce((s, e) => s + e.txn_count, 0)} transactions)
                    </span>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setAddError(null);
                    setNewParent("");
                    setNewSub("");
                    setAddModalOpen(true);
                  }}
                  className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 shrink-0"
                >
                  Add Custom Categories
                </button>
              </div>

              {unmappedEntries.length > 0 && (
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
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
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkControls(!showBulkControls);
                      if (!showBulkControls) {
                        setSelectedUnmapped(new Set());
                        setBulkError(null);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0 ${
                      showBulkControls
                        ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                        : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {showBulkControls ? "Hide Filter" : "Show Filter"}
                  </button>
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
                  {/* Bulk category controls */}
                  {showBulkControls && (
                  <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[10rem]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Parent Category
                        </label>
                        <select
                          value={bulkParent}
                          onChange={(e) => {
                            setBulkParent(e.target.value);
                            setBulkSub("");
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          <option value="">— Select —</option>
                          {parentOptions.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[10rem]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Sub-Category
                        </label>
                        <select
                          value={bulkSub}
                          onChange={(e) => setBulkSub(e.target.value)}
                          disabled={!bulkParent}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                        >
                          <option value="">— Select —</option>
                          {(masterMerged[bulkParent] ?? []).map((s) => (
                            <option key={s.id} value={capitalizeWords(s.sub_category)}>
                              {capitalizeWords(s.sub_category)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleBulkApply()}
                        disabled={selectedUnmapped.size === 0 || !bulkParent || !bulkSub || bulkApplying}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 shrink-0"
                      >
                        {bulkApplying ? "Applying…" : `Apply (${selectedUnmapped.size})`}
                      </button>
                    </div>
                    {bulkError && <p className="text-red-600 text-xs mt-2">{bulkError}</p>}
                    {selectedUnmapped.size > 0 && !bulkError && (
                      <p className="text-indigo-700 text-xs mt-2">
                        {selectedUnmapped.size} selected · Choose category to apply
                      </p>
                    )}
                  </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-base min-w-[48rem]">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                          {showBulkControls && (
                          <th className="pb-2 pr-4 font-medium w-8">
                            <input
                              type="checkbox"
                              checked={selectedUnmapped.size === filteredUnmappedEntries.length && filteredUnmappedEntries.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUnmapped(new Set(filteredUnmappedEntries.map((x) => x.short_description)));
                                } else {
                                  setSelectedUnmapped(new Set());
                                }
                              }}
                              className="rounded"
                            />
                          </th>
                          )}
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
                          const isSelected = selectedUnmapped.has(entry.short_description);
                          return (
                            <tr key={entry.short_description} className={`hover:bg-gray-50 ${isSelected && showBulkControls ? "bg-indigo-50" : ""}`}>
                              {showBulkControls && (
                              <td className="py-3 pr-4">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const newSet = new Set(selectedUnmapped);
                                    if (e.target.checked) {
                                      newSet.add(entry.short_description);
                                    } else {
                                      newSet.delete(entry.short_description);
                                    }
                                    setSelectedUnmapped(newSet);
                                  }}
                                  className="rounded"
                                />
                              </td>
                              )}
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
                                  Add
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

          {/* ── Mapped tab ──────────────────────────────────────────── */}
          {activeTab === "mapped" && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-800">
                  Mapped Categories
                  {mappedCategories.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({mappedCategories.length} categories)
                    </span>
                  )}
                </h2>
                <div className="w-full sm:w-80 sm:shrink-0">
                  <label htmlFor="mapped-search" className="sr-only">
                    Search mapped categories
                  </label>
                  <input
                    id="mapped-search"
                    type="search"
                    placeholder="Search category…"
                    value={mappedSearch}
                    onChange={(e) => setMappedSearch(e.target.value)}
                    className={TABLE_SEARCH_INPUT_CLASS}
                  />
                </div>
              </div>

              {mappedCategories.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  No mapped categories yet. Assign categories to transactions to see them here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-base min-w-[40rem]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                        <th className="pb-2 pr-4 font-medium">Parent Category</th>
                        <th className="pb-2 pr-4 font-medium">Sub-Category</th>
                        <th className="pb-2 pr-4 font-medium w-24">Transactions</th>
                        <th className="pb-2 font-medium text-right w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mappedCategories
                        .filter((cat) => {
                          const q = mappedSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            cat.parent_category.toLowerCase().includes(q) ||
                            cat.sub_category.toLowerCase().includes(q)
                          );
                        })
                        .map((cat) => (
                          <tr key={`${cat.parent_category}-${cat.sub_category}`} className="hover:bg-gray-50">
                            <td className="py-3 pr-4 align-top">
                              <CategoryBadge value={cat.parent_category} />
                            </td>
                            <td className="py-3 pr-4 text-gray-800 align-top">{capitalizeWords(cat.sub_category)}</td>
                            <td className="py-3 pr-4 text-gray-700 font-medium">{cat.txn_count}</td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded border border-indigo-200 hover:bg-indigo-50"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Dictionary tab ──────────────────────────────────────────── */}
              {/* Built-in Categories Header */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Built-in</h3>
                <p className="text-xs text-gray-500 mt-1">System-provided categories</p>
              </div>

              {/* Built-in Content */}
              <div className="space-y-4">
                {Object.keys(masterBuiltin).length === 0 ? (
                  <p className="text-gray-400 text-sm py-6 text-center">No built-in categories available.</p>
                ) : (
                  Object.keys(masterBuiltin)
                    .sort()
                    .filter((parent) => {
                      const q = dictionarySearch.trim().toLowerCase();
                      if (!q) return true;
                      if (parent.toLowerCase().includes(q)) return true;
                      const subs = masterBuiltin[parent] ?? [];
                      return subs.some((s) => s.sub_category.toLowerCase().includes(q));
                    })
                    .map((parent) => (
                      <div key={parent} className="border border-gray-200 rounded-lg p-4">
                        <div className="mb-3">
                          <CategoryBadge value={parent} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(masterBuiltin[parent] ?? []).map((sub) => (
                            <span
                              key={sub.id}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              {capitalizeWords(sub.sub_category)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* Search for Built-in (optional) */}
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Search built-in categories…"
                  value={dictionarySearch}
                  onChange={(e) => setDictionarySearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            {/* DIVIDER */}
            <div
              className={`bg-gray-200 cursor-col-resize hover:bg-indigo-400 transition-colors ${
                isDragging ? "bg-indigo-500" : ""
              }`}
              onMouseDown={handleDividerMouseDown}
              style={{ userSelect: "none" }}
            />

            {/* RIGHT PANE: User-defined */}
            <div className="overflow-y-auto bg-white">
              <div className="p-4 sm:p-6 space-y-4">
                {/* User-defined Categories Header */}
                <div className="mb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">User-defined</h3>
                      <p className="text-xs text-gray-500 mt-1">Your custom categories</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddError(null);
                        setNewParent("");
                        setNewSub("");
                        setAddModalOpen(true);
                      }}
                      className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 whitespace-nowrap"
                    >
                      Add Category
                    </button>
                  </div>
                </div>

                {/* User-defined Content */}
                <div className="space-y-4">
                  {Object.keys(masterUser).length === 0 ? (
                    <p className="text-gray-400 text-sm py-6 text-center">
                      No user-defined categories yet. Click "Add Category" to create one.
                    </p>
                  ) : (
                    Object.keys(masterUser)
                      .sort()
                      .filter((parent) => {
                        const q = dictionarySearch.trim().toLowerCase();
                        if (!q) return true;
                        if (parent.toLowerCase().includes(q)) return true;
                        const subs = masterUser[parent] ?? [];
                        return subs.some((s) => s.sub_category.toLowerCase().includes(q));
                      })
                      .map((parent) => (
                        <div key={parent} className="border border-gray-200 rounded-lg p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <CategoryBadge value={parent} />
                            <button
                              type="button"
                              onClick={() => {
                                const entry = masterUser[parent]?.find(s => s.id);
                                if (entry) {
                                  setEditEntry({ id: entry.id, parent_category: parent, sub_category: parent });
                                  setEditParent(parent);
                                  setEditSub(parent);
                                }
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800"
                            >
                              Edit
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(masterUser[parent] ?? []).map((sub) => (
                              <span
                                key={sub.id}
                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700 border border-green-200"
                              >
                                {capitalizeWords(sub.sub_category)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                  )}
                </div>

                {/* Search for User-defined (optional) */}
                <div className="mt-4">
                  <input
                    type="text"
                    placeholder="Search user-defined categories…"
                    value={dictionarySearch}
                    onChange={(e) => setDictionarySearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

