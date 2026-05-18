import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTransactionDateScope,
  type CategoryMasterSubEntry,
  type TransactionDateScope,
} from "../services/api";
import {
  resolveDefaultRange,
  type DateRangeValue,
} from "../utils/dateRangePresets";

export type CategoryMasterMerged = Record<string, CategoryMasterSubEntry[]>;

export interface UseTransactionDateScopeResult {
  scope: TransactionDateScope | null;
  bankNames: string[];
  categoryMaster: CategoryMasterMerged;
  defaultRange: DateRangeValue | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Load filter scope: transaction date bounds, banks, category master, and default range.
 */
export function useTransactionDateScope(): UseTransactionDateScopeResult {
  const [scope, setScope] = useState<TransactionDateScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransactionDateScope();
      setScope(data);
    } catch {
      setError("Could not load transaction dates.");
      setScope(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultRange = scope ? resolveDefaultRange(scope) : null;

  const bankNames = useMemo(() => scope?.bank_names ?? [], [scope]);

  const categoryMaster = useMemo(
    (): CategoryMasterMerged => scope?.category_master ?? {},
    [scope],
  );

  return {
    scope,
    bankNames,
    categoryMaster,
    defaultRange,
    loading,
    error,
    refetch: () => {
      void load();
    },
  };
}
