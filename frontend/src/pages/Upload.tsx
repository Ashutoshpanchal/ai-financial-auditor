import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

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

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
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

  const reset = () => {
    setFile(null);
    setBankName("");
    setPdfPassword("");
    setUpload({ state: "idle", documentId: null, auditId: null, errorMsg: null });
    if (pollRef.current) clearInterval(pollRef.current);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
    if (!upload.documentId || upload.state === "completed" || upload.state === "failed") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; error_message?: string | null }>(
          `/documents/${upload.documentId}`
        );
        const rawStatus = res.data.status;
        const s = rawStatus as UploadState;

        if (s === "completed") {
          setUpload((prev) => ({ ...prev, state: "completed" }));
          clearInterval(pollRef.current!);
          onUploaded();
          try {
            const auditRes = await api.get<{ id: string }[]>(
              `/audit?document_id=${upload.documentId}`
            );
            if (auditRes.data.length > 0) {
              setUpload((prev) => ({ ...prev, auditId: auditRes.data[0].id }));
            }
          } catch { /* audit not ready yet */ }
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
  }, [upload.documentId, upload.state, onUploaded]);

  if (!open) return null;

  const currentStepIdx = UPLOAD_STEPS.indexOf(upload.state);

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


          {/* PDF password */}
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
              {UPLOAD_STEPS.map((step, idx) => {
                const done = currentStepIdx > idx;
                const active = currentStepIdx === idx;
                const isFailed = upload.state === "failed";
                return (
                  <div key={step} className="flex items-center flex-1 min-w-0">
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
                        {STEP_LABELS[step]}
                      </span>
                    </div>
                    {idx < UPLOAD_STEPS.length - 1 && (
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
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
              <span>✅ Audit complete!</span>
              {upload.auditId ? (
                <Link to={`/audit/${upload.auditId}`} className="font-semibold text-green-800 hover:underline" onClick={handleClose}>View Report →</Link>
              ) : (
                <button onClick={handleClose} className="font-semibold text-green-800 hover:underline">Close</button>
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
              ) : "Upload & Analyze"}
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
  const [txnBankFilter, setTxnBankFilter] = useState("");
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotal, setTxnTotal] = useState(0);
  const txnPageSize = 20;

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null);
  const [editingTxn, setEditingTxn] = useState<TransactionRow | null>(null);
  const [deletingTxnId, setDeletingTxnId] = useState<string | null>(null);

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
      if (txnBankFilter) params.set("bank_name", txnBankFilter);

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
  }, [txnPage, txnSearch, txnBankFilter]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleUploaded = useCallback(() => {
    fetchDocuments();
    fetchTransactions();
  }, [fetchDocuments, fetchTransactions]);

  const handleRefreshAll = useCallback(() => {
    fetchDocuments();
    fetchTransactions();
  }, [fetchDocuments, fetchTransactions]);

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

  // Edit transaction
  const handleEditTxn = useCallback(async (txn: TransactionRow, newDesc: string) => {
    try {
      await api.patch(`/transactions/${txn.id}`, { description: newDesc });
      setAllTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, description: newDesc } : t)));
      setEditingTxn(null);
    } catch (err: unknown) {
      alert((err as ApiErr)?.response?.data?.detail ?? "Failed to update transaction.");
    }
  }, []);

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || doc.filename.toLowerCase().includes(q) || doc.bank_name.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const txnTotalPages = Math.ceil(txnTotal / txnPageSize);

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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex-1">All Transactions</h2>
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={txnSearch} onChange={(e) => { setTxnSearch(e.target.value); setTxnPage(1); }} placeholder="Search transactions…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <input type="text" value={txnBankFilter} onChange={(e) => { setTxnBankFilter(e.target.value); setTxnPage(1); }} placeholder="Filter by bank…" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40" />
          </div>

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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allTransactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{new Date(txn.transaction_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 text-gray-800 max-w-xs">
                          {editingTxn?.id === txn.id ? (
                            <input
                              type="text"
                              defaultValue={txn.description}
                              autoFocus
                              className="w-full rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              onBlur={(e) => { if (e.target.value !== txn.description) handleEditTxn(txn, e.target.value); else setEditingTxn(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingTxn(null); }}
                            />
                          ) : (
                            <span className="cursor-pointer hover:text-indigo-600 block truncate" onClick={() => setEditingTxn(txn)} title="Click to edit">{txn.description}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{txn.bank_name}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {txn.debit > 0 ? (
                            <span className="font-semibold text-red-600">
                              ₹{txn.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {txn.credit > 0 ? (
                            <span className="font-semibold text-green-600">
                              ₹{txn.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingTxn(txn)}
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
                    ))}
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
      <UploadModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUploaded={handleUploaded} />
      <EditDocumentModal doc={editDoc} open={!!editDoc} onClose={() => setEditDoc(null)} onSaved={fetchDocuments} />
      <ConfirmDeleteModal doc={deleteDoc} open={!!deleteDoc} onClose={() => setDeleteDoc(null)} onConfirm={fetchDocuments} />
    </>
  );
}
