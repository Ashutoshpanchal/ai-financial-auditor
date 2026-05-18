import { useCallback, useEffect, useState } from "react";
import { fetchTransactionDateScope, type TransactionDateScope } from "../services/api";
import {
  resolveDefaultRange,
  type DateRangeValue,
} from "../utils/dateRangePresets";

export interface UseTransactionDateScopeResult {
  scope: TransactionDateScope | null;
  defaultRange: DateRangeValue | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Load the user's transaction date bounds and derive a data-aware default range.
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

  return {
    scope,
    defaultRange,
    loading,
    error,
    refetch: () => {
      void load();
    },
  };
}
