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
