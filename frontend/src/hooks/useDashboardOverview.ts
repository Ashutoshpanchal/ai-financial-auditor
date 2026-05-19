import { useEffect, useState } from "react";
import type { FilterState } from "../components/dashboard/FilterBar";
import type { DashboardOverviewData } from "../types/dashboardOverview";

const API_BASE = "http://localhost:8000";

interface UseDashboardOverviewResult {
  data: DashboardOverviewData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches aggregated dashboard overview for editorial cards.
 */
export function useDashboardOverview(filters: FilterState): UseDashboardOverviewResult {
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { dateFrom, dateTo, bankNames, parentCategory, subCategories } = filters;
  const bankName = bankNames[0] ?? "";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (bankName) params.set("bank_name", bankName);
    if (parentCategory) params.set("parent_category", parentCategory);
    for (const s of subCategories) {
      params.append("sub_category", s);
    }

    fetch(`${API_BASE}/dashboard/overview?${params}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DashboardOverviewData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, bankName, parentCategory, subCategories]);

  return { data, isLoading, error };
}
