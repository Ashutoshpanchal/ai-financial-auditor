/// <reference types="vite/client" />
import axios from "axios";

const rawBase = import.meta.env.VITE_API_URL;
const baseURL =
  typeof rawBase === "string" && rawBase.trim() !== ""
    ? rawBase.trim()
    : "http://localhost:8000";

export const api = axios.create({
  baseURL,
  withCredentials: true, // send httpOnly cookie with every request
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/") {
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

// ─── Unmapped short descriptions ──────────────────────────────────────────────

export interface UnmappedEntry {
  short_description: string;
  txn_count: number;
  sample_raw_descriptions: string[];
}

export async function fetchUnmapped(): Promise<UnmappedEntry[]> {
  const res = await api.get<UnmappedEntry[]>("/categories/unmapped");
  return res.data;
}

export async function resolveUnmapped(
  shortDescription: string,
  parentCategory: string,
  subCategory: string,
): Promise<{ short_description: string; parent_category: string; sub_category: string; categorized_count: number }> {
  const res = await api.post("/categories/resolve-unmapped", {
    short_description: shortDescription,
    parent_category: parentCategory,
    sub_category: subCategory,
  });
  return res.data;
}

/** Result of POST /categories/apply-mappings (CM match + description rules). */
export interface CategoryApplyMappingsResult {
  message: string;
  updated: number;
  auto_categorized?: number;
  rules_applied?: number;
}

export async function postApplyCategoryMappings(
  body: { document_id?: string } = {},
): Promise<CategoryApplyMappingsResult> {
  const res = await api.post<CategoryApplyMappingsResult>("/categories/apply-mappings", body);
  return res.data;
}

/** Result of POST /categories/reset-sync (recompute short_description + full remap). */
export interface CategoryResetSyncResult {
  message: string;
  transactions_touched: number;
  auto_categorized: number;
  rules_applied: number;
}

export async function postResetCategorySync(
  body: { document_id?: string } = {},
): Promise<CategoryResetSyncResult> {
  const res = await api.post<CategoryResetSyncResult>("/categories/reset-sync", body);
  return res.data;
}

// ─── Category insights (PC × month × SC) ─────────────────────────────────────

export type FlowMode = "debit" | "credit" | "both";

export interface CategoryFlowRow {
  parent_category: string;
  month: string;
  sub_category: string;
  debit_total: number;
  credit_total: number;
  txn_count: number;
}

export interface CategoryFlowResponse {
  rows: CategoryFlowRow[];
  totals: { debit: number; credit: number; txn_count: number };
  truncated: boolean;
  truncated_reason?: string;
}

export interface CategoryMasterSubEntry {
  id: string;
  sub_category: string;
  is_global?: boolean;
}

export interface TransactionDateScope {
  min_date: string | null;
  max_date: string | null;
  months_with_data: string[];
  has_transactions: boolean;
  /** Distinct non-empty bank_name values from transactions (sorted). */
  bank_names?: string[];
  /** Merged category master (same shape as GET /categories/master/split merged). */
  category_master?: Record<string, CategoryMasterSubEntry[]>;
}

export async function fetchTransactionDateScope(): Promise<TransactionDateScope> {
  const res = await api.get<TransactionDateScope>("/analytics/transaction-date-scope");
  return res.data;
}

export async function fetchCategoryFlow(params: {
  dateFrom: string;
  dateTo: string;
  parentCategory: string;
  subCategories?: string[];
  mode: FlowMode;
  bankName?: string;
}): Promise<CategoryFlowResponse> {
  const q = new URLSearchParams();
  q.set("date_from", params.dateFrom);
  q.set("date_to", params.dateTo);
  q.set("parent_category", params.parentCategory);
  q.set("mode", params.mode);
  if (params.subCategories?.length) {
    for (const s of params.subCategories) {
      q.append("sub_category", s);
    }
  }
  if (params.bankName?.trim()) {
    q.set("bank_name", params.bankName.trim());
  }
  const res = await api.get<CategoryFlowResponse>(`/analytics/category-flow?${q.toString()}`);
  return res.data;
}

export interface CategoryFlowParentRow {
  parent_category: string;
  month: string;
  debit_total: number;
  credit_total: number;
  txn_count: number;
}

export interface CategoryFlowByParentResponse {
  rows: CategoryFlowParentRow[];
  totals: { debit: number; credit: number; txn_count: number };
  truncated: boolean;
  truncated_reason?: string;
}

export interface CategoryFlowMetadata {
  date_from: string;
  date_to: string;
  months_available: string[];
  years: number[];
  total_rows: number;
  parent_categories: string[];
}

export interface CategoryFlowByParentPaginatedResponse {
  rows: CategoryFlowParentRow[];
  pagination: {
    current_cursor: string | null;
    next_cursor: string | null;
    has_more: boolean;
    limit: number;
    rows_returned: number;
  };
}

export async function fetchCategoryFlowByParent(params: {
  dateFrom: string;
  dateTo: string;
  mode: FlowMode;
  bankName?: string;
}): Promise<CategoryFlowByParentResponse> {
  const q = new URLSearchParams();
  q.set("date_from", params.dateFrom);
  q.set("date_to", params.dateTo);
  q.set("mode", params.mode);
  if (params.bankName?.trim()) {
    q.set("bank_name", params.bankName.trim());
  }
  const res = await api.get<CategoryFlowByParentResponse>(
    `/analytics/category-flow-by-parent?${q.toString()}`,
  );
  return res.data;
}

export async function fetchCategoryFlowMetadata(params: {
  dateFrom: string;
  dateTo: string;
  bankName?: string;
}): Promise<CategoryFlowMetadata> {
  const q = new URLSearchParams();
  q.set("date_from", params.dateFrom);
  q.set("date_to", params.dateTo);
  if (params.bankName?.trim()) {
    q.set("bank_name", params.bankName.trim());
  }
  const res = await api.get<CategoryFlowMetadata>(
    `/analytics/category-flow-by-parent/metadata?${q.toString()}`,
  );
  return res.data;
}

export async function fetchCategoryFlowByParentPaginated(params: {
  dateFrom: string;
  dateTo: string;
  mode: FlowMode;
  monthCursor?: string | null;
  limit?: number;
  bankName?: string;
}): Promise<CategoryFlowByParentPaginatedResponse> {
  const q = new URLSearchParams();
  q.set("date_from", params.dateFrom);
  q.set("date_to", params.dateTo);
  q.set("mode", params.mode);
  if (params.bankName?.trim()) {
    q.set("bank_name", params.bankName.trim());
  }
  if (params.limit !== undefined) {
    q.set("limit", params.limit.toString());
  }
  if (params.monthCursor) {
    q.set("month_cursor", params.monthCursor);
  }
  const res = await api.get<CategoryFlowByParentPaginatedResponse>(
    `/analytics/category-flow-by-parent/paginated?${q.toString()}`,
  );
  return res.data;
}
