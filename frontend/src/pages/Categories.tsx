import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import axios from "axios";
import { createPortal, flushSync } from "react-dom";
import { api, fetchUnmapped, resolveUnmapped } from "../services/api";
import type { UnmappedEntry } from "../services/api";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAPPINGS_PAGE_SIZE = 10;
const UNMAPPED_PAGE_SIZE = 10;
/** Parent groups per page in Category Dictionary split panes */
const DICTIONARY_PARENT_PAGE_SIZE = 20;

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
    <span
      className={`inline-block max-w-full break-words [overflow-wrap:anywhere] px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

function CatalogRefreshButton({
  pending,
  onRefresh,
  "aria-label": ariaLabel = "Refresh category data",
}: {
  pending: boolean;
  onRefresh: () => void | Promise<void>;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={ariaLabel}
      onClick={() => void onRefresh()}
      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      <svg
        className={`w-4 h-4 ${pending ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992V4.356m-1.636 13.645A9 9 0 1119.643 7.357l1.372 1.991"
        />
      </svg>
      {pending ? "Refreshing…" : "Refresh"}
    </button>
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
  const [dictionarySearch, setDictionarySearch] = useState("");
  const [dictBuiltinPage, setDictBuiltinPage] = useState(1);
  const [dictUserPage, setDictUserPage] = useState(1);
  const [descriptionSearch, setDescriptionSearch] = useState("");
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

  /** Resizable split between built-in and user-defined dictionary (same pattern as Upload). */
  const [dictLeftPaneWidth, setDictLeftPaneWidth] = useState(() => {
    if (typeof window === "undefined") return 480;
    return Math.min(Math.max(window.innerWidth * 0.46, 360), Math.floor(window.innerWidth * 0.62));
  });
  const [dictSplitDragging, setDictSplitDragging] = useState(false);
  const DICT_MIN_PANE = 300;

  const [catalogRefreshPending, setCatalogRefreshPending] = useState(false);

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

  const handleRefreshCatalog = useCallback(async () => {
    setCatalogRefreshPending(true);
    try {
      await Promise.all([
        loadMaster(),
        loadDescriptions(),
        loadPaymentMethods(),
        loadUnmapped(),
        loadMapped(),
      ]);
    } finally {
      setCatalogRefreshPending(false);
    }
  }, [loadMaster, loadDescriptions, loadPaymentMethods, loadUnmapped, loadMapped]);

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
    setDescPage(1);
  }, [descriptionSearch]);

  useEffect(() => {
    setUnmappedPage(1);
  }, [unmappedSearch]);

  useEffect(() => {
    setDictBuiltinPage(1);
    setDictUserPage(1);
  }, [dictionarySearch]);

  /** Show dictionary + rules tables once master or rules data exists (not only when rules are non-empty). */
  const showFullCatalogUi = descriptions.length > 0 || Object.keys(masterMerged).length > 0;

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

  const filteredBuiltinParents = useMemo(() => {
    const keys = Object.keys(masterBuiltin).sort();
    const q = dictionarySearch.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((parent) => {
      if (parent.toLowerCase().includes(q)) return true;
      const subs = masterBuiltin[parent] ?? [];
      return subs.some((s) => s.sub_category.toLowerCase().includes(q));
    });
  }, [masterBuiltin, dictionarySearch]);

  const filteredUserParents = useMemo(() => {
    const keys = Object.keys(masterUser).sort();
    const q = dictionarySearch.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((parent) => {
      if (parent.toLowerCase().includes(q)) return true;
      const subs = masterUser[parent] ?? [];
      return subs.some((s) => s.sub_category.toLowerCase().includes(q));
    });
  }, [masterUser, dictionarySearch]);

  const paginatedBuiltinParents = useMemo(() => {
    const start = (dictBuiltinPage - 1) * DICTIONARY_PARENT_PAGE_SIZE;
    return filteredBuiltinParents.slice(start, start + DICTIONARY_PARENT_PAGE_SIZE);
  }, [filteredBuiltinParents, dictBuiltinPage]);

  const paginatedUserParents = useMemo(() => {
    const start = (dictUserPage - 1) * DICTIONARY_PARENT_PAGE_SIZE;
    return filteredUserParents.slice(start, start + DICTIONARY_PARENT_PAGE_SIZE);
  }, [filteredUserParents, dictUserPage]);

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

  useEffect(() => {
    setDictBuiltinPage((p) => {
      const totalPages = Math.max(
        1,
        Math.ceil(filteredBuiltinParents.length / DICTIONARY_PARENT_PAGE_SIZE),
      );
      return p > totalPages ? totalPages : p;
    });
  }, [filteredBuiltinParents.length]);

  useEffect(() => {
    setDictUserPage((p) => {
      const totalPages = Math.max(
        1,
        Math.ceil(filteredUserParents.length / DICTIONARY_PARENT_PAGE_SIZE),
      );
      return p > totalPages ? totalPages : p;
    });
  }, [filteredUserParents.length]);

  const handleDictDividerMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDictSplitDragging(true);
  }, []);

  const handleDictSplitMouseMove = useCallback(
    (e: globalThis.MouseEvent) => {
      if (!dictSplitDragging) return;
      const container = document.querySelector("[data-categories-dict-split]");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = e.clientX - rect.left;
      const max = rect.width - DICT_MIN_PANE;
      setDictLeftPaneWidth(Math.max(DICT_MIN_PANE, Math.min(next, max)));
    },
    [dictSplitDragging, DICT_MIN_PANE],
  );

  const handleDictSplitMouseUp = useCallback(() => {
    setDictSplitDragging(false);
  }, []);

  useEffect(() => {
    if (!dictSplitDragging) return;
    document.addEventListener("mousemove", handleDictSplitMouseMove);
    document.addEventListener("mouseup", handleDictSplitMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleDictSplitMouseMove);
      document.removeEventListener("mouseup", handleDictSplitMouseUp);
    };
  }, [dictSplitDragging, handleDictSplitMouseMove, handleDictSplitMouseUp]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
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
          <p className="text-sm text-gray-600 max-w-xl mb-4">
            Upload a statement or add dictionary entries. Data loads automatically when you open this page.
          </p>
          <CatalogRefreshButton
            pending={catalogRefreshPending}
            onRefresh={handleRefreshCatalog}
            aria-label="Reload category data"
          />
        </div>
      )}

      {/* ── Full-width dictionary (collapsible) + mappings ───────────────── */}
      {showFullCatalogUi && (
        <div className="flex flex-col gap-8">
          {/* Tab bar: Dictionary | Unmapped | Mapped */}
          <div className="flex flex-wrap items-end gap-1 border-b border-gray-200">
            <div className="flex items-center gap-1 min-w-0">
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
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "mapped"}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                  activeTab === "mapped"
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
                onClick={() => setActiveTab("mapped")}
              >
                Mapped
                {mappedCategories.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    {mappedCategories.length}
                  </span>
                )}
              </button>
            </div>
          </div>

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
                <div className="flex flex-wrap items-center gap-2">
                  <CatalogRefreshButton
                    pending={catalogRefreshPending}
                    onRefresh={handleRefreshCatalog}
                    aria-label="Refresh unmapped merchants"
                  />
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
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                  <CatalogRefreshButton
                    pending={catalogRefreshPending}
                    onRefresh={handleRefreshCatalog}
                    aria-label="Refresh mapped categories"
                  />
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
          {activeTab === "dictionary" && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 w-full">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 gap-y-2">
              <div className="flex items-center gap-2 min-w-0">
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
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end sm:ml-auto">
                  <CatalogRefreshButton
                    pending={catalogRefreshPending}
                    onRefresh={handleRefreshCatalog}
                    aria-label="Refresh category dictionary"
                  />
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
              )}
            </div>

            {dictionaryOpen && (
              <>
                <div
                  className="rounded-xl border border-gray-200 bg-gray-50/80 overflow-x-auto"
                  data-categories-dict-split
                >
                  <div
                    className="grid w-full min-h-[min(400px,50vh)] max-h-[min(1200px,calc(100vh-10rem))] items-stretch min-w-[min(100%,560px)]"
                    style={{ gridTemplateColumns: `${dictLeftPaneWidth}px 4px 1fr`, gap: 0 }}
                  >
                    {/* Left: built-in */}
                    <div className="flex flex-col min-h-0 min-w-0 bg-white border-r border-gray-200">
                      <div className="shrink-0 p-4 border-b border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-800">Built-in</h3>
                        <p className="text-xs text-gray-500 mt-0.5">System category dictionary (read-only)</p>
                      </div>
                      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto p-4 space-y-4">
                        {Object.keys(masterBuiltin).length === 0 ? (
                          <p className="text-gray-400 text-sm py-6 text-center">No categories available.</p>
                        ) : filteredBuiltinParents.length === 0 ? (
                          <p className="text-gray-400 text-sm py-6 text-center">No rows match your search.</p>
                        ) : (
                          paginatedBuiltinParents.map((parent) => (
                            <div
                              key={parent}
                              className="border border-gray-200 rounded-lg p-4 bg-white min-w-0 max-w-full"
                            >
                              <div className="mb-3 min-w-0">
                                <CategoryBadge value={parent} />
                              </div>
                              <div className="flex flex-wrap gap-2 min-w-0">
                                {(masterBuiltin[parent] ?? []).map((sub) => (
                                  <span
                                    key={sub.id}
                                    className="inline-flex items-center max-w-full px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 break-words [overflow-wrap:anywhere]"
                                  >
                                    {capitalizeWords(sub.sub_category)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {Object.keys(masterBuiltin).length > 0 && (
                        <div className="shrink-0 px-2 pb-2 bg-white">
                          <PaginationBar
                            page={dictBuiltinPage}
                            totalItems={filteredBuiltinParents.length}
                            pageSize={DICTIONARY_PARENT_PAGE_SIZE}
                            onPageChange={setDictBuiltinPage}
                            aria-label="Built-in dictionary pagination"
                          />
                        </div>
                      )}
                    </div>

                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize built-in and user-defined panes"
                      className={`bg-gray-200 cursor-col-resize hover:bg-indigo-400 transition-colors shrink-0 ${
                        dictSplitDragging ? "bg-indigo-500" : ""
                      }`}
                      onMouseDown={handleDictDividerMouseDown}
                      style={{ userSelect: "none" }}
                    />

                    {/* Right: user-defined */}
                    <div className="flex flex-col min-h-0 min-w-0 bg-white">
                      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-800">User-defined</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Your custom dictionary entries</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddError(null);
                            setNewParent("");
                            setNewSub("");
                            setAddModalOpen(true);
                          }}
                          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 shrink-0"
                        >
                          Add Custom Categories
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto p-4 space-y-4">
                        {Object.keys(masterUser).length === 0 ? (
                          <p className="text-gray-400 text-sm py-6 text-center">
                            {`No user-defined categories yet. Use "Add Custom Categories" above to create your first entry.`}
                          </p>
                        ) : filteredUserParents.length === 0 ? (
                          <p className="text-gray-400 text-sm py-6 text-center">No rows match your search.</p>
                        ) : (
                          paginatedUserParents.map((parent) => (
                            <div
                              key={parent}
                              className="border border-gray-200 rounded-lg p-4 bg-white min-w-0 max-w-full"
                            >
                              <div className="mb-3 min-w-0">
                                <CategoryBadge value={parent} />
                              </div>
                              <div className="flex flex-wrap gap-2 min-w-0">
                                {(masterUser[parent] ?? []).map((sub) => (
                                  <div
                                    key={sub.id}
                                    className="inline-flex items-center gap-2 max-w-full px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 group hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors"
                                  >
                                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                                      {capitalizeWords(sub.sub_category)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSub(sub.id)}
                                      className="text-lg leading-none font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      title="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {Object.keys(masterUser).length > 0 && (
                        <div className="shrink-0 px-2 pb-2 bg-white">
                          <PaginationBar
                            page={dictUserPage}
                            totalItems={filteredUserParents.length}
                            pageSize={DICTIONARY_PARENT_PAGE_SIZE}
                            onPageChange={setDictUserPage}
                            aria-label="User-defined dictionary pagination"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          )}

          {/* ── Category rules — hidden from UI; change outer `false` to `true` to restore ─ */}
          {/* eslint-disable-next-line no-constant-binary-expression */}
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
                                <option key={s.id} value={capitalizeWords(s.sub_category)}>
                                  {capitalizeWords(s.sub_category)}
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

      {/* Add Category modal */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !addSaving && setAddModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-category-title"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="add-category-title" className="text-lg font-semibold text-gray-900 mb-3">
              Add Category
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="add-parent" className="block text-xs font-medium text-gray-600 mb-1">
                  Parent category (PC)
                </label>
                <input
                  id="add-parent"
                  type="text"
                  value={newParent}
                  onChange={(e) => setNewParent(e.target.value)}
                  list="parent-options-add"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Food & Dining"
                />
                <datalist id="parent-options-add">
                  {parentOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="add-sub" className="block text-xs font-medium text-gray-600 mb-1">
                  Sub-category (SC)
                </label>
                <input
                  id="add-sub"
                  type="text"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Zomato"
                />
              </div>
            </div>
            {addError && <p className="text-red-500 text-sm mt-3">{addError}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={addSaving}
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={addSaving}
                onClick={() => void handleAddSub()}
              >
                {addSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
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
            <button
              type="button"
              onClick={() => {
                setResolveModalOpen(false);
                setAddError(null);
                setNewParent("");
                setNewSub("");
                setAddModalOpen(true);
              }}
              className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mb-4 block"
            >
              + Add custom category
            </button>
            <div className="space-y-3">
              <div>
                <label htmlFor="resolve-parent" className="block text-xs font-medium text-gray-600 mb-1">
                  Parent category
                </label>
                <select
                  id="resolve-parent"
                  value={resolveParent}
                  onChange={(e) => {
                    setResolveParent(e.target.value);
                    setResolveSub("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— Select a category —</option>
                  {parentOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="resolve-sub" className="block text-xs font-medium text-gray-600 mb-1">
                  Sub-category
                </label>
                <select
                  id="resolve-sub"
                  value={resolveSub}
                  onChange={(e) => setResolveSub(e.target.value)}
                  disabled={!resolveParent}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                >
                  <option value="">— Select a sub-category —</option>
                  {(masterMerged[resolveParent] ?? []).map((s) => (
                    <option key={s.id} value={capitalizeWords(s.sub_category)}>
                      {capitalizeWords(s.sub_category)}
                    </option>
                  ))}
                </select>
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
