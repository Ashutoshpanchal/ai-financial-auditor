import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, postApplyCategoryMappings, postResetCategorySync } from "../services/api";

type ApiErr = { response?: { status?: number; data?: { detail?: string } } };
type DupDetail = { filename?: string; upload_date?: string; message?: string };

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "embedding"
  | "auditing"
  | "completed"
  | "failed";

interface DocumentRow {
  id: string;
  filename: string;
  bank_name: string;
  file_type: string;
  status: DocumentStatus;
  upload_date: string;
  transaction_count?: number;
}

interface TransactionRow {
  id: string;
  bank_name: string;
  transaction_date: string;
  description: string;
  debit: number;
  credit: number;
  category: string | null;
  parent_category?: string | null;
  sub_category?: string | null;
  category_master_id?: string | null;
  remarks: Record<string, string> | null;
}

type UploadState =
  | "idle"
  | "uploading"
  | "parsing"
  | "embedding"
  | "auditing"
  | "completed"
  | "failed";

interface UploadStatus {
  state: UploadState;
  documentId: string | null;
  auditId: string | null;
  errorMsg: string | null;
}

const STATUS_BADGE: Record<DocumentStatus, { label: string; classes: string }> = {
  uploaded:  { label: "Uploaded",  classes: "bg-blue-100 text-blue-700" },
  parsing:   { label: "Parsing",   classes: "bg-yellow-100 text-yellow-700" },
  parsed:    { label: "Parsed",    classes: "bg-yellow-100 text-yellow-700" },
  embedding: { label: "Embedding", classes: "bg-purple-100 text-purple-700" },
  auditing:  { label: "Auditing",  classes: "bg-orange-100 text-orange-700" },
  completed: { label: "Completed", classes: "bg-green-100 text-green-700" },
  failed:    { label: "Failed",    classes: "bg-red-100 text-red-700" },
};

const ALL_STATUSES: DocumentStatus[] = [
  "uploaded", "parsing", "parsed", "embedding", "auditing", "completed", "failed",
];

const UPLOAD_STEPS: UploadState[] = ["uploading", "parsing", "embedding", "auditing", "completed"];

const STEP_LABELS: Record<string, string> = {
  uploading: "Uploading",
  parsing: "Parsing",
  embedding: "Embedding",
  auditing: "Auditing",
  completed: "Complete",
};

/** Must match ``ALLOWED_PDF_PARSE_STRATEGIES`` in ``backend/parsers/pdf_strategies.py``. */
const PDF_PARSE_STRATEGY_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto — try tables, then text" },
  { value: "tables_only", label: "Tables only (no text fallback)" },
  { value: "text_only", label: "Text / regex only" },
];

/** How amount maps to API min_amount / max_amount (debit or credit column). */
type TxnAmountMode = "any" | "between" | "at_least" | "at_most" | "exact";

type TxnEditableField = "description" | "debit" | "credit";

/**
 * When true, the upload modal shows the auditing step, "Upload & Analyze", and
 * "View Report" after processing. Keep audit-related code paths intact; toggle
 * only visibility and branching.
 */
const SHOW_AUDIT_ON_UPLOAD = false;

/** Stepper labels when audit is hidden (embedding + auditing share "Processing"). */
const STEPS_AUDIT_OFF: { label: string; stateMatch: (s: UploadState) => boolean }[] = [
  { label: "Uploading", stateMatch: (s) => s === "uploading" },
  { label: "Parsing", stateMatch: (s) => s === "parsing" },
  { label: "Processing", stateMatch: (s) => s === "embedding" || s === "auditing" },
  { label: "Complete", stateMatch: (s) => s === "completed" },
];

function visibleStepIndexAuditOff(state: UploadState): number {
  if (state === "failed") return 0;
  for (let i = 0; i < STEPS_AUDIT_OFF.length; i++) {
    if (STEPS_AUDIT_OFF[i].stateMatch(state)) return i;
  }
  return 0;
}

/** True when a transaction has no category label (null, empty, or whitespace). */
function isUncategorizedCategory(category: string | null | undefined): boolean {
  return category == null || String(category).trim() === "";
}

/** Copy plain text to the clipboard (best-effort). */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      /* ignore */
    }
  }
}

// ─── Category sync (post-upload) ─────────────────────────────────────────────

function CategorySyncModal({
  open,
  documentId,
  onClose,
  onApplied,
}: {
  open: boolean;
  /** When set, only transactions for this document are updated. When null, all of the user’s transactions in scope are updated. */
  documentId: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<{ auto: number; rules: number } | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      setUpdated(null);
      setBreakdown(null);
      setSyncing(false);
    }
  }, [open, documentId]);

  if (!open) return null;

  const handleSync = async () => {
    setSyncing(true);
    setErr(null);
    try {
      const body = documentId ? { document_id: documentId } : {};
      const data = await postApplyCategoryMappings(body);
      setUpdated(data.updated);
      setBreakdown({
        auto: data.auto_categorized ?? 0,
        rules: data.rules_applied ?? 0,
      });
      onApplied();
    } catch (e: unknown) {
      setErr((e as ApiErr)?.response?.data?.detail ?? "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleReset = () => {
    setResetConfirmOpen(true);
    setResetError(null);
  };

  const handleConfirmReset = async () => {
    setResettingInModal(true);
    setResetError(null);
    setSyncing(true);
    setErr(null);
    try {
      const body = documentId ? { document_id: documentId } : {};
      const data = await postResetCategorySync(body);
      setUpdated(data.auto_categorized + data.rules_applied);
      setBreakdown({ auto: data.auto_categorized, rules: data.rules_applied });
      setResetConfirmOpen(false);
      onApplied();
    } catch (e: unknown) {
      const errMsg = (e as ApiErr)?.response?.data?.detail ?? "Reset failed.";
      setResetError(errMsg);
      setErr(errMsg);
    } finally {
      setResettingInModal(false);
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Sync categories</h3>
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">Sync now</span> matches your{" "}
          <span className="font-medium text-gray-800">short descriptions</span> to the category dictionary, then applies your{" "}
          <span className="font-medium text-gray-800">description → category</span> rules to rows that are still unmatched.{" "}
          {documentId ? (
            <>Only transactions from this upload are included.</>
          ) : (
            <>Every transaction you own is included.</>
          )}{" "}
          Run <span className="font-medium text-gray-800">Categories → Analyze</span> first if you need AI to build new rules.
        </p>
        {err && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>
        )}
        {updated !== null && (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Updated {updated} transaction{updated === 1 ? "" : "s"}
            {breakdown ? ` (dictionary: ${breakdown.auto}, rules: ${breakdown.rules}).` : "."}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
          {updated === null ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={syncing}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={syncing}
                className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50"
              >
                {syncing ? "Working…" : "Reset & remap"}
              </button>
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Reset confirmation modal */}
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !resettingInModal && setResetConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Reset and remap {documentId ? "this upload" : "all transactions"}?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This clears saved categories, recomputes short descriptions, then matches category rules again.
            </p>

            {/* Loading bar */}
            {resettingInModal && (
              <div className="mb-4">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 animate-pulse w-full" />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">Processing…</p>
              </div>
            )}

            {resetError && (
              <p className="text-red-500 text-sm mb-4">{resetError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={resettingInModal}
                onClick={() => setResetConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                disabled={resettingInModal}
                onClick={() => void handleConfirmReset()}
              >
                {resettingInModal ? "Processing…" : "Reset & Remap"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  onUploaded,
  onStatementProcessed,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  onStatementProcessed?: (documentId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [pdfParseStrategy, setPdfParseStrategy] = useState("auto");
  const [pdfPassword, setPdfPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState<UploadStatus>({
    state: "idle",
    documentId: null,
    auditId: null,
    errorMsg: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPdf = file ? (file.type === "application/pdf" || file.name.endsWith(".pdf")) : false;
  const isProcessing =
    upload.state !== "idle" &&
    upload.state !== "completed" &&
    upload.state !== "failed";

  const reset = useCallback(() => {
    setFile(null);
    setBankName("");
    setPdfParseStrategy("auto");
    setPdfPassword("");
    setUpload({ state: "idle", documentId: null, auditId: null, errorMsg: null });
    if (pollRef.current) clearInterval(pollRef.current);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (upload.documentId) onUploaded();
    reset();
    onClose();
  };

  const isValidFile = (f: File) =>
    f.type === "text/csv" || f.name.endsWith(".csv") || f.type === "application/pdf";

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) setFile(dropped);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked && isValidFile(picked)) setFile(picked);
  };

  const handleUpload = async () => {
    if (!file || !bankName.trim()) return;
    setUpload({ state: "uploading", documentId: null, auditId: null, errorMsg: null });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bank_name", bankName.trim());
    if (isPdf) formData.append("pdf_parse_strategy", pdfParseStrategy);
    if (isPdf && pdfPassword) formData.append("pdf_password", pdfPassword);

    try {
      const res = await api.post<{ document_id: string }>("/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUpload((prev) => ({ ...prev, state: "parsing", documentId: res.data.document_id }));
    } catch (err: unknown) {
      const apiErr = err as ApiErr;
      if (apiErr?.response?.status === 409) {
        const dup = (apiErr?.response?.data as unknown as { detail?: DupDetail })?.detail;
        setUpload({
          state: "failed",
          documentId: null,
          auditId: null,
          errorMsg: `Duplicate: "${dup?.filename}" was already uploaded on ${dup?.upload_date ? new Date(dup.upload_date).toLocaleDateString() : "a previous date"}.`,
        });
      } else {
        setUpload({
          state: "failed",
          documentId: null,
          auditId: null,
          errorMsg: apiErr?.response?.data?.detail ?? "Upload failed.",
        });
      }
    }
  };

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!upload.documentId || upload.state === "completed" || upload.state === "failed") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; error_message?: string | null }>(
          `/documents/${upload.documentId}`
        );
        const rawStatus = res.data.status;
        const s = rawStatus as UploadState;

        if (s === "completed") {
          const docId = upload.documentId;
          setUpload((prev) => ({ ...prev, state: "completed" }));
          clearInterval(pollRef.current!);
          if (docId) {
            if (SHOW_AUDIT_ON_UPLOAD) {
              onUploaded();
              try {
                const auditRes = await api.get<{ id: string }[]>(
                  `/audit?document_id=${docId}`
                );
                if (auditRes.data.length > 0) {
                  setUpload((prev) => ({ ...prev, auditId: auditRes.data[0].id }));
                }
              } catch { /* audit not ready yet */ }
            } else if (onStatementProcessed) {
              onStatementProcessed(docId);
            } else {
              onUploaded();
            }
          } else {
            onUploaded();
          }
        } else if (s === "failed") {
          setUpload((prev) => ({
            ...prev,
            state: "failed",
            errorMsg: res.data.error_message ?? "Processing failed.",
          }));
          clearInterval(pollRef.current!);
        } else {
          const mapped: UploadState =
            rawStatus === "uploaded" || rawStatus === "parsing"
              ? "parsing"
              : rawStatus === "parsed" || rawStatus === "embedding"
                ? "embedding"
                : rawStatus === "auditing"
                  ? "auditing"
                  : s;
          setUpload((prev) => ({ ...prev, state: mapped }));
        }
      } catch { /* silently retry */ }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [upload.documentId, upload.state, onUploaded, onStatementProcessed]);

  if (!open) return null;

  const displaySteps = SHOW_AUDIT_ON_UPLOAD
    ? UPLOAD_STEPS.map((step) => ({ key: step, label: STEP_LABELS[step] ?? step }))
    : STEPS_AUDIT_OFF.map((s, i) => ({ key: `audit-off-${i}`, label: s.label }));

  const currentStepIdx = SHOW_AUDIT_ON_UPLOAD
    ? UPLOAD_STEPS.indexOf(upload.state)
    : visibleStepIndexAuditOff(upload.state);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Upload Bank Statement</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors
              ${dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}
              ${isProcessing ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
            `}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.pdf" className="hidden" onChange={handleFileChange} disabled={isProcessing} />
            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${isPdf ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {isPdf ? "PDF" : "CSV"}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{file.name}</span>
                </div>
                <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB — click to change</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <svg className="w-9 h-9 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium text-gray-600">Drag & drop or click to browse</p>
                <p className="text-xs text-gray-400">Accepts .csv and .pdf</p>
              </div>
            )}
          </div>


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. HDFC, SBI, ICICI"
              disabled={isProcessing}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>

          {isPdf && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PDF extraction</label>
              <p className="text-xs text-gray-500 mb-1.5">
                Banks use different PDF layouts. Use Auto first; switch mode if transaction counts look wrong.
              </p>
              <select
                value={pdfParseStrategy}
                onChange={(e) => setPdfParseStrategy(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
              >
                {PDF_PARSE_STRATEGY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PDF password */}
          {isPdf && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF Password <span className="text-xs font-normal text-gray-400">(if protected)</span>
              </label>
              <input
                type="password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                placeholder="Leave blank if not password-protected"
                disabled={isProcessing}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {/* Progress steps */}
          {upload.state !== "idle" && (
            <div className="flex items-center gap-0 w-full">
              {displaySteps.map((stepMeta, idx) => {
                const done = currentStepIdx > idx;
                const active = currentStepIdx === idx;
                const isFailed = upload.state === "failed";
                return (
                  <div key={stepMeta.key} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                        ${done ? "bg-indigo-600 text-white" : ""}
                        ${active && !isFailed ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400" : ""}
                        ${active && isFailed ? "bg-red-100 text-red-600 ring-2 ring-red-300" : ""}
                        ${!done && !active ? "bg-gray-100 text-gray-400" : ""}
                      `}>
                        {done ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span className={`mt-1 text-[10px] font-medium whitespace-nowrap ${done ? "text-indigo-600" : active ? "text-gray-800" : "text-gray-400"}`}>
                        {stepMeta.label}
                      </span>
                    </div>
                    {idx < displaySteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-4 rounded transition-colors ${done ? "bg-indigo-500" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {upload.state === "failed" && upload.errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{upload.errorMsg}</div>
          )}

          {upload.state === "completed" && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-2">
              <span>{SHOW_AUDIT_ON_UPLOAD ? "✅ Audit complete!" : "✅ Upload complete"}</span>
              {SHOW_AUDIT_ON_UPLOAD && upload.auditId ? (
                <Link to={`/audit/${upload.auditId}`} className="font-semibold text-green-800 hover:underline shrink-0" onClick={handleClose}>View Report →</Link>
              ) : (
                <button type="button" onClick={handleClose} className="font-semibold text-green-800 hover:underline shrink-0">Close</button>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleUpload}
              disabled={!file || !bankName.trim() || isProcessing || upload.state === "completed"}
              className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1 h-1 rounded-full bg-white opacity-80 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </span>
                  Processing…
                </span>
              ) : SHOW_AUDIT_ON_UPLOAD ? "Upload & Analyze" : "Upload"}
            </button>
            {(isProcessing || upload.state === "failed" || upload.state === "completed") && (
              <button onClick={reset} className="px-5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Reset</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Document Modal ──────────────────────────────────────────────────────

function EditDocumentModal({ doc, open, onClose, onSaved }: { doc: DocumentRow | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [bankName, setBankName] = useState("");
  const [filename, setFilename] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doc) { setBankName(doc.bank_name); setFilename(doc.filename); setError(null); }
  }, [doc]);

  if (!open || !doc) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/documents/${doc.id}`, { bank_name: bankName.trim(), filename: filename.trim() });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError((err as ApiErr)?.response?.data?.detail ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Edit Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filename</label>
            <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving || !bankName.trim() || !filename.trim()} className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{saving ? "Saving…" : "Save Changes"}</button>
            <button onClick={onClose} className="px-5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({ doc, open, onClose, onConfirm }: { doc: DocumentRow | null; open: boolean; onClose: () => void; onConfirm: () => void }) {
  const [deleting, setDeleting] = useState(false);
  if (!open || !doc) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/documents/${doc.id}`);
      onConfirm();
      onClose();
    } catch (err: unknown) {
      alert((err as ApiErr)?.response?.data?.detail ?? "Failed to delete document.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Delete Document</h3>
              <p className="text-sm text-gray-500 mt-0.5">This will permanently delete <strong>{doc.filename}</strong> and all its transactions.</p>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? "Deleting…" : "Delete"}</button>
            <button onClick={onClose} className="px-5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Upload() {
  // Documents state
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");

  // Transactions state (separate table)
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");
  const [txnFromDate, setTxnFromDate] = useState("");
  const [txnToDate, setTxnToDate] = useState("");
  const [txnMinAmount, setTxnMinAmount] = useState("");
  const [txnMaxAmount, setTxnMaxAmount] = useState("");
  const [txnAmountOperator, setTxnAmountOperator] = useState<"" | "<" | "<=" | "=" | ">=" | ">">("");
  const [txnAmountValue, setTxnAmountValue] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [draftAmountMode, setDraftAmountMode] = useState<TxnAmountMode>("any");
  const [draftAmountFrom, setDraftAmountFrom] = useState("");
  const [draftAmountTo, setDraftAmountTo] = useState("");
  const [draftAmountOperator, setDraftAmountOperator] = useState<"" | "<" | "<=" | "=" | ">=" | ">">("");
  const [draftAmountValue, setDraftAmountValue] = useState("");
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotal, setTxnTotal] = useState(0);
  const txnPageSize = 20;

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [categorySyncModal, setCategorySyncModal] = useState<{
    open: boolean;
    documentId: string | null;
  }>({ open: false, documentId: null });
  const [, setUnmatchedSummary] = useState<{
    uncategorized_transaction_count: number;
    distinct_uncategorized_descriptions: number;
  } | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null);
  const [editingTxnField, setEditingTxnField] = useState<{ id: string; field: TxnEditableField } | null>(null);
  const [deletingTxnId, setDeletingTxnId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingInModal, setResettingInModal] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Split-pane state
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    if (typeof window === "undefined") return 400; // default for SSR
    return Math.max(window.innerWidth * 0.4, 300); // 40% of window, minimum 300px
  });
  const [isDragging, setIsDragging] = useState(false);

  const fetchUnmatchedSummary = useCallback(async () => {
    try {
      const res = await api.get<{
        uncategorized_transaction_count: number;
        distinct_uncategorized_descriptions: number;
      }>("/categories/unmatched-summary");
      setUnmatchedSummary(res.data);
    } catch {
      setUnmatchedSummary(null);
    }
  }, []);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<DocumentRow[]>("/documents");
      setDocuments(res.data);
      setError(null);
    } catch (err: unknown) {
      setError((err as ApiErr)?.response?.data?.detail ?? "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all transactions
  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(txnPage),
        page_size: String(txnPageSize),
      });
      if (txnSearch) params.set("search", txnSearch);
      if (txnFromDate) params.set("from_date", txnFromDate);
      if (txnToDate) params.set("to_date", txnToDate);
      if (txnMinAmount) params.set("min_amount", txnMinAmount);
      if (txnMaxAmount) params.set("max_amount", txnMaxAmount);
      if (txnAmountOperator && txnAmountValue) {
        params.set("amount_operator", txnAmountOperator);
        params.set("amount_value", txnAmountValue);
      }

      const res = await api.get<{ items: TransactionRow[]; total: number }>(
        `/documents/transactions/all?${params}`
      );
      setAllTransactions(res.data.items);
      setTxnTotal(res.data.total);
    } catch {
      setAllTransactions([]);
      setTxnTotal(0);
    } finally {
      setTxnLoading(false);
    }
  }, [txnPage, txnSearch, txnFromDate, txnToDate, txnMinAmount, txnMaxAmount, txnAmountOperator, txnAmountValue]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => {
    void fetchUnmatchedSummary();
  }, [fetchUnmatchedSummary]);

  const handleUploaded = useCallback(() => {
    void fetchDocuments();
    void fetchTransactions();
    void fetchUnmatchedSummary();
  }, [fetchDocuments, fetchTransactions, fetchUnmatchedSummary]);

  const handleStatementProcessed = useCallback((documentId: string) => {
    void fetchDocuments();
    void fetchTransactions();
    setUploadModalOpen(false);
    setCategorySyncModal({ open: true, documentId });
  }, [fetchDocuments, fetchTransactions]);

  const pageHasUncategorized = useMemo(
    () => allTransactions.some((t) => isUncategorizedCategory(t.category)),
    [allTransactions]
  );

  const handleRefreshAll = useCallback(() => {
    fetchDocuments();
    fetchTransactions();
    void fetchUnmatchedSummary();
  }, [fetchDocuments, fetchTransactions, fetchUnmatchedSummary]);


  // Delete transaction
  const handleDeleteTxn = useCallback(async (txnId: string) => {
    setDeletingTxnId(txnId);
    try {
      await api.delete(`/transactions/${txnId}`);
      fetchTransactions();
      fetchDocuments();
    } catch (err: unknown) {
      alert((err as ApiErr)?.response?.data?.detail ?? "Failed to delete transaction.");
    } finally {
      setDeletingTxnId(null);
    }
  }, [fetchTransactions, fetchDocuments]);

  // Edit transaction (description and/or amounts)
  const handlePatchTxn = useCallback(
    async (
      txn: TransactionRow,
      patch: { description?: string; debit?: number; credit?: number }
    ) => {
      try {
        await api.patch(`/transactions/${txn.id}`, patch);
        setAllTransactions((prev) =>
          prev.map((t) =>
            t.id === txn.id
              ? {
                  ...t,
                  ...(patch.description !== undefined ? { description: patch.description } : {}),
                  ...(patch.debit !== undefined ? { debit: patch.debit } : {}),
                  ...(patch.credit !== undefined ? { credit: patch.credit } : {}),
                }
              : t
          )
        );
        setEditingTxnField(null);
      } catch (err: unknown) {
        alert((err as ApiErr)?.response?.data?.detail ?? "Failed to update transaction.");
      }
    },
    []
  );

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || doc.filename.toLowerCase().includes(q) || doc.bank_name.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const txnTotalPages = Math.ceil(txnTotal / txnPageSize);
  const openFilters = useCallback(() => {
    setDraftFromDate(txnFromDate);
    setDraftToDate(txnToDate);
    if (!txnMinAmount && !txnMaxAmount) {
      setDraftAmountMode("any");
      setDraftAmountFrom("");
      setDraftAmountTo("");
    } else if (txnMinAmount && txnMaxAmount && txnMinAmount === txnMaxAmount) {
      setDraftAmountMode("exact");
      setDraftAmountFrom(txnMinAmount);
      setDraftAmountTo("");
    } else if (txnMinAmount && txnMaxAmount) {
      setDraftAmountMode("between");
      setDraftAmountFrom(txnMinAmount);
      setDraftAmountTo(txnMaxAmount);
    } else if (txnMinAmount) {
      setDraftAmountMode("at_least");
      setDraftAmountFrom(txnMinAmount);
      setDraftAmountTo("");
    } else {
      setDraftAmountMode("at_most");
      setDraftAmountFrom(txnMaxAmount);
      setDraftAmountTo("");
    }
    setDraftAmountOperator(txnAmountOperator);
    setDraftAmountValue(txnAmountValue);
    setFilterOpen(true);
  }, [txnFromDate, txnToDate, txnMinAmount, txnMaxAmount, txnAmountOperator, txnAmountValue]);
  const applyFilters = useCallback(() => {
    setTxnFromDate(draftFromDate);
    setTxnToDate(draftToDate);
    const from = draftAmountFrom.trim();
    const to = draftAmountTo.trim();
    switch (draftAmountMode) {
      case "any":
        setTxnMinAmount("");
        setTxnMaxAmount("");
        break;
      case "between":
        setTxnMinAmount(from);
        setTxnMaxAmount(to);
        break;
      case "at_least":
        setTxnMinAmount(from);
        setTxnMaxAmount("");
        break;
      case "at_most":
        setTxnMinAmount("");
        setTxnMaxAmount(from);
        break;
      case "exact":
        setTxnMinAmount(from);
        setTxnMaxAmount(from);
        break;
      default:
        setTxnMinAmount("");
        setTxnMaxAmount("");
    }
    if (draftAmountOperator && draftAmountValue.trim()) {
      setTxnAmountOperator(draftAmountOperator);
      setTxnAmountValue(draftAmountValue.trim());
    } else {
      setTxnAmountOperator("");
      setTxnAmountValue("");
    }
    setTxnPage(1);
    setFilterOpen(false);
  }, [
    draftFromDate,
    draftToDate,
    draftAmountMode,
    draftAmountFrom,
    draftAmountTo,
    draftAmountOperator,
    draftAmountValue,
  ]);
  const clearAllFilters = useCallback(() => {
    setTxnFromDate("");
    setTxnToDate("");
    setTxnMinAmount("");
    setTxnMaxAmount("");
    setTxnAmountOperator("");
    setTxnAmountValue("");
    setDraftFromDate("");
    setDraftToDate("");
    setDraftAmountMode("any");
    setDraftAmountFrom("");
    setDraftAmountTo("");
    setDraftAmountOperator("");
    setDraftAmountValue("");
    setTxnPage(1);
    setFilterOpen(false);
  }, []);
  const removeFilter = useCallback(
    (filterKey: "from_date" | "to_date" | "min_amount" | "max_amount" | "amount_exact" | "amount_condition") => {
    if (filterKey === "from_date") {
      setTxnFromDate("");
      setDraftFromDate("");
    }
    if (filterKey === "to_date") {
      setTxnToDate("");
      setDraftToDate("");
    }
    if (filterKey === "min_amount") {
      setTxnMinAmount("");
    }
    if (filterKey === "max_amount") {
      setTxnMaxAmount("");
    }
    if (filterKey === "amount_exact") {
      setTxnMinAmount("");
      setTxnMaxAmount("");
    }
    if (filterKey === "amount_condition") {
      setTxnAmountOperator("");
      setTxnAmountValue("");
      setDraftAmountOperator("");
      setDraftAmountValue("");
    }
    setTxnPage(1);
  }, []);

  const activeFilterChips: Array<{
    key: "from_date" | "to_date" | "min_amount" | "max_amount" | "amount_exact" | "amount_condition";
    label: string;
  }> = [];
  if (txnFromDate) activeFilterChips.push({ key: "from_date", label: `From: ${txnFromDate}` });
  if (txnToDate) activeFilterChips.push({ key: "to_date", label: `To: ${txnToDate}` });
  if (txnMinAmount && txnMaxAmount && txnMinAmount === txnMaxAmount) {
    activeFilterChips.push({ key: "amount_exact", label: `Amount = ${txnMinAmount}` });
  } else {
    if (txnMinAmount) activeFilterChips.push({ key: "min_amount", label: `Debit/Credit ≥ ${txnMinAmount}` });
    if (txnMaxAmount) activeFilterChips.push({ key: "max_amount", label: `Debit/Credit ≤ ${txnMaxAmount}` });
  }
  if (txnAmountOperator && txnAmountValue) {
    activeFilterChips.push({
      key: "amount_condition",
      label: `Also: debit/credit ${txnAmountOperator} ${txnAmountValue}`,
    });
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page title */}
        <div className="mb-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Uploads</h1>
            <button
              onClick={handleRefreshAll}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m-1.636 13.645A9 9 0 1119.643 7.357l1.372 1.991" />
              </svg>
              Refresh
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">Manage your uploaded bank statements and transactions</p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            DOCUMENTS SECTION
        ═══════════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex-1">Documents</h2>
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | "all")} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer">
              <option value="all">All Statuses</option>
              {ALL_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_BADGE[s].label}</option>))}
            </select>
            <button onClick={() => setUploadModalOpen(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Upload
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm mb-4">{error}</div>}

          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4 px-6 py-4">
                    <div className="h-4 w-48 bg-gray-100 rounded" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 flex flex-col items-center gap-3 text-center">
              <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              <p className="text-sm text-gray-500">{documents.length === 0 ? "No documents uploaded yet." : "No documents match your filters."}</p>
              <button onClick={() => setUploadModalOpen(true)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Upload your first statement →</button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Filename</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Uploaded</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDocs.map((doc) => {
                    const badge = STATUS_BADGE[doc.status] ?? { label: doc.status, classes: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-800 font-medium max-w-xs truncate">{doc.filename}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{doc.bank_name}</td>
                        <td className="px-6 py-3"><span className="uppercase text-xs font-semibold text-gray-500">{doc.file_type}</span></td>
                        <td className="px-6 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.classes}`}>{badge.label}</span></td>
                        <td className="px-6 py-3 text-sm text-gray-500">{new Date(doc.upload_date).toLocaleDateString()}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditDoc(doc)} className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>
                            <button onClick={() => setDeleteDoc(doc)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                Showing {filteredDocs.length} of {documents.length} document{documents.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            TRANSACTIONS SECTION
        ═══════════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
            <h2 className="text-lg font-semibold text-gray-800 flex-1">All Transactions</h2>
            {pageHasUncategorized && (
              <>
                <button
                  type="button"
                  onClick={() => setCategorySyncModal({ open: true, documentId: null })}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shrink-0 whitespace-nowrap"
                >
                  Sync categories
                </button>
              </>
            )}
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={txnSearch}
                onChange={(e) => { setTxnSearch(e.target.value); setTxnPage(1); }}
                placeholder="Search transaction or bank…"
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              type="button"
              onClick={() => { if (filterOpen) setFilterOpen(false); else openFilters(); }}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
            >
              Filters
              <svg className={`w-4 h-4 transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {filterOpen && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4 max-w-3xl">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Date</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={draftFromDate}
                    onChange={(e) => setDraftFromDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    aria-label="Transaction from date"
                  />
                  <input
                    type="date"
                    value={draftToDate}
                    onChange={(e) => setDraftToDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    aria-label="Transaction to date"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Amount (debit or credit)</p>
                <select
                  value={draftAmountMode}
                  onChange={(e) => setDraftAmountMode(e.target.value as TxnAmountMode)}
                  className="w-full sm:w-72 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer mb-2"
                  aria-label="Transaction amount filter mode"
                >
                  <option value="any">Any amount</option>
                  <option value="between">Between…</option>
                  <option value="at_least">At least…</option>
                  <option value="at_most">At most…</option>
                  <option value="exact">Exactly…</option>
                </select>
                {draftAmountMode === "between" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmountFrom}
                      onChange={(e) => setDraftAmountFrom(e.target.value)}
                      placeholder="From"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      aria-label="Transaction amount from"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmountTo}
                      onChange={(e) => setDraftAmountTo(e.target.value)}
                      placeholder="To"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      aria-label="Transaction amount to"
                    />
                  </div>
                )}
                {(draftAmountMode === "at_least" || draftAmountMode === "at_most" || draftAmountMode === "exact") && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draftAmountFrom}
                    onChange={(e) => setDraftAmountFrom(e.target.value)}
                    placeholder="Amount"
                    className="w-full sm:max-w-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    aria-label="Transaction amount value"
                  />
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Uses the non-zero value in the Debit or Credit column for each row. Amount band (mode above) and optional extra rule below are combined with <strong>AND</strong>.
                </p>
                <div className="pt-3 mt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Optional extra amount rule (AND with band)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={draftAmountOperator}
                      onChange={(e) =>
                        setDraftAmountOperator(e.target.value as "" | "<" | "<=" | "=" | ">=" | ">")
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                      aria-label="Transaction amount operator"
                    >
                      <option value="">No extra rule</option>
                      <option value="<">{"<"}</option>
                      <option value="<=">{"<="}</option>
                      <option value="=">{"="}</option>
                      <option value=">=">{">="}</option>
                      <option value=">">{">"}</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmountValue}
                      onChange={(e) => setDraftAmountValue(e.target.value)}
                      placeholder="Compare value"
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      aria-label="Transaction amount compare value"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Leave operator empty unless you also enter a value. Both are sent together.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {activeFilterChips.map((chip, chipIdx) => (
                <span key={`${chip.key}-${chipIdx}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => removeFilter(chip.key)}
                    className="text-gray-500 hover:text-gray-700"
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                className="px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50"
                type="button"
              >
                Clear all
              </button>
            </div>
          )}

          {txnLoading ? (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
              <div className="divide-y divide-gray-50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 px-6 py-3">
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-64 bg-gray-100 rounded" />
                    <div className="h-4 w-20 bg-gray-100 rounded" />
                    <div className="h-4 w-24 bg-gray-100 rounded ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          ) : allTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 flex flex-col items-center gap-3 text-center">
              <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M19.125 14.625c.621 0 1.125.504 1.125 1.125" /></svg>
              <p className="text-sm text-gray-500">No transactions found. Upload a bank statement to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank Name</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-red-400 uppercase tracking-wider">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-green-500 uppercase tracking-wider">Credit</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allTransactions.map((txn) => {
                      const isEditDesc = editingTxnField?.id === txn.id && editingTxnField.field === "description";
                      const isEditDebit = editingTxnField?.id === txn.id && editingTxnField.field === "debit";
                      const isEditCredit = editingTxnField?.id === txn.id && editingTxnField.field === "credit";
                      return (
                      <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{new Date(txn.transaction_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 text-gray-800 max-w-xs">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <div className="min-w-0 flex-1">
                              {isEditDesc ? (
                                <input
                                  type="text"
                                  defaultValue={txn.description}
                                  autoFocus
                                  className="w-full rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  onBlur={(e) => {
                                    if (e.target.value !== txn.description) void handlePatchTxn(txn, { description: e.target.value });
                                    else setEditingTxnField(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    if (e.key === "Escape") setEditingTxnField(null);
                                  }}
                                />
                              ) : (
                                <span
                                  className="cursor-pointer hover:text-indigo-600 block truncate"
                                  onClick={() => setEditingTxnField({ id: txn.id, field: "description" })}
                                  title="Click to edit"
                                >
                                  {txn.description}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyToClipboard(txn.description)}
                              className="shrink-0 p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                              title="Copy description"
                              aria-label="Copy description"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{txn.bank_name}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap align-top">
                          <div className="inline-flex flex-col items-end gap-1">
                            <div className="flex items-center justify-end gap-1">
                              {isEditDebit ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={txn.debit}
                                  autoFocus
                                  className="w-28 rounded border border-indigo-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  onBlur={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (Number.isNaN(v) || v < 0) {
                                      setEditingTxnField(null);
                                      return;
                                    }
                                    const rounded = Math.round(v * 100) / 100;
                                    if (rounded !== txn.debit) void handlePatchTxn(txn, { debit: rounded });
                                    else setEditingTxnField(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    if (e.key === "Escape") setEditingTxnField(null);
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingTxnField({ id: txn.id, field: "debit" })}
                                  className="text-left font-semibold text-red-600 hover:underline"
                                  title="Click to edit debit"
                                >
                                  {txn.debit > 0
                                    ? `₹${txn.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                    : <span className="text-gray-300 font-normal">—</span>}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(String(txn.debit))}
                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                title="Copy debit amount"
                                aria-label="Copy debit amount"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap align-top">
                          <div className="inline-flex flex-col items-end gap-1">
                            <div className="flex items-center justify-end gap-1">
                              {isEditCredit ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={txn.credit}
                                  autoFocus
                                  className="w-28 rounded border border-indigo-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  onBlur={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (Number.isNaN(v) || v < 0) {
                                      setEditingTxnField(null);
                                      return;
                                    }
                                    const rounded = Math.round(v * 100) / 100;
                                    if (rounded !== txn.credit) void handlePatchTxn(txn, { credit: rounded });
                                    else setEditingTxnField(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    if (e.key === "Escape") setEditingTxnField(null);
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingTxnField({ id: txn.id, field: "credit" })}
                                  className="text-left font-semibold text-green-600 hover:underline"
                                  title="Click to edit credit"
                                >
                                  {txn.credit > 0
                                    ? `₹${txn.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                    : <span className="text-gray-300 font-normal">—</span>}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(String(txn.credit))}
                                className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 shrink-0"
                                title="Copy credit amount"
                                aria-label="Copy credit amount"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-left max-w-[10rem]">
                          {isUncategorizedCategory(txn.category) ? (
                            <span className="text-gray-400 font-medium">None</span>
                          ) : (
                            <span className="text-gray-800 truncate block" title={txn.category ?? undefined}>
                              {txn.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingTxnField({ id: txn.id, field: "description" })}
                              className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Edit description"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button onClick={() => handleDeleteTxn(txn.id)} disabled={deletingTxnId === txn.id} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Showing {((txnPage - 1) * txnPageSize) + 1}–{Math.min(txnPage * txnPageSize, txnTotal)} of {txnTotal} transactions
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTxnPage((p) => Math.max(1, p - 1))} disabled={txnPage <= 1} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                  <span className="text-xs text-gray-500">Page {txnPage} of {txnTotalPages || 1}</span>
                  <button onClick={() => setTxnPage((p) => Math.min(txnTotalPages, p + 1))} disabled={txnPage >= txnTotalPages} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      <UploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploaded={handleUploaded}
        onStatementProcessed={SHOW_AUDIT_ON_UPLOAD ? undefined : handleStatementProcessed}
      />
      <CategorySyncModal
        open={categorySyncModal.open}
        documentId={categorySyncModal.open ? categorySyncModal.documentId : null}
        onClose={() => setCategorySyncModal({ open: false, documentId: null })}
        onApplied={handleUploaded}
      />
      <EditDocumentModal doc={editDoc} open={!!editDoc} onClose={() => setEditDoc(null)} onSaved={fetchDocuments} />
      <ConfirmDeleteModal doc={deleteDoc} open={!!deleteDoc} onClose={() => setDeleteDoc(null)} onConfirm={fetchDocuments} />
    </>
  );
}
