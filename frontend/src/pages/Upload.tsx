import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus =
  | "idle"
  | "uploading"
  | "parsing"
  | "embedding"
  | "auditing"
  | "completed"
  | "failed";

interface DocumentResponse {
  id: string;
  status: UploadStatus;
  error_message?: string | null;
}

const STATUS_STEPS: UploadStatus[] = ["uploading", "parsing", "embedding", "auditing", "completed"];

const STEP_LABELS: Record<string, string> = {
  uploading: "Uploading",
  parsing: "Parsing",
  embedding: "Embedding",
  auditing: "Auditing",
  completed: "Complete",
};

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

// ─── Progress Steps ───────────────────────────────────────────────────────────

function ProgressSteps({ current }: { current: UploadStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-0 w-full mt-6">
      {STATUS_STEPS.map((step, idx) => {
        const done = currentIdx > idx;
        const active = currentIdx === idx;
        const isFailed = current === "failed";
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${done ? "bg-indigo-600 text-white" : ""}
                  ${active && !isFailed ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400" : ""}
                  ${active && isFailed ? "bg-red-100 text-red-600 ring-2 ring-red-300" : ""}
                  ${!done && !active ? "bg-gray-100 text-gray-400" : ""}
                `}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`mt-1 text-xs font-medium whitespace-nowrap
                  ${done ? "text-indigo-600" : active ? "text-gray-800" : "text-gray-400"}
                `}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mb-5 rounded transition-colors ${
                  done ? "bg-indigo-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Drag handlers ──────────────────────────────────────────────────────────

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

  function isValidFile(f: File) {
    return f.type === "text/csv" || f.name.endsWith(".csv") || f.type === "application/pdf";
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file || !bankName.trim()) return;
    setErrorMsg(null);
    setUploadStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bank_name", bankName.trim());

    try {
      const res = await api.post<DocumentResponse>("/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocumentId(res.data.id);
      setUploadStatus("parsing");
    } catch (err: any) {
      setUploadStatus("failed");
      setErrorMsg(err?.response?.data?.detail ?? "Upload failed. Please try again.");
    }
  };

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!documentId || uploadStatus === "completed" || uploadStatus === "failed") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<DocumentResponse>(`/documents/${documentId}`);
        const s = res.data.status;

        if (s === "completed") {
          setUploadStatus("completed");
          clearInterval(pollRef.current!);
          // Fetch the associated audit to get its id for the link
          const auditRes = await api.get<{ id: string }[]>(`/audit?document_id=${documentId}`);
          if (auditRes.data.length > 0) setAuditId(auditRes.data[0].id);
        } else if (s === "failed") {
          setUploadStatus("failed");
          setErrorMsg(res.data.error_message ?? "Processing failed.");
          clearInterval(pollRef.current!);
        } else {
          setUploadStatus(s as UploadStatus);
        }
      } catch {
        // silently retry
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [documentId, uploadStatus]);

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    setBankName("");
    setUploadStatus("idle");
    setDocumentId(null);
    setErrorMsg(null);
    setAuditId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isProcessing =
    uploadStatus !== "idle" && uploadStatus !== "completed" && uploadStatus !== "failed";

  const fileExt = file
    ? file.name.endsWith(".csv")
      ? "CSV"
      : "PDF"
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Bank Statement</h1>
        <p className="text-sm text-gray-500 mb-8">
          Upload a CSV or PDF bank statement to generate your AI audit report.
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors
              ${dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}
              ${isProcessing ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  {fileExt && (
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase
                        ${fileExt === "CSV" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}
                      `}
                    >
                      {fileExt}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-800">{file.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {(file.size / 1024).toFixed(1)} KB — click to change
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <svg
                  className="w-10 h-10 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-600">
                  Drag &amp; drop or click to browse
                </p>
                <p className="text-xs text-gray-400">Accepts .csv and .pdf</p>
              </div>
            )}
          </div>

          {/* Bank name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase, Bank of America"
              disabled={isProcessing}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Progress steps */}
          {uploadStatus !== "idle" && <ProgressSteps current={uploadStatus} />}

          {/* Error */}
          {uploadStatus === "failed" && errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Completed */}
          {uploadStatus === "completed" && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
              <span>Audit complete!</span>
              {auditId ? (
                <Link
                  to={`/audit/${auditId}`}
                  className="ml-3 font-semibold text-green-800 hover:underline"
                >
                  View Report →
                </Link>
              ) : (
                <Link
                  to="/dashboard"
                  className="ml-3 font-semibold text-green-800 hover:underline"
                >
                  Go to Dashboard →
                </Link>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleUpload}
              disabled={!file || !bankName.trim() || isProcessing || uploadStatus === "completed"}
              className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold
                hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingDots />
                  Processing…
                </span>
              ) : (
                "Upload & Analyze"
              )}
            </button>
            {(isProcessing || uploadStatus === "failed" || uploadStatus === "completed") && (
              <button
                onClick={handleCancel}
                className="px-5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600
                  hover:bg-gray-50 transition-colors"
              >
                {uploadStatus === "completed" || uploadStatus === "failed" ? "Reset" : "Cancel"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-white opacity-80 animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
