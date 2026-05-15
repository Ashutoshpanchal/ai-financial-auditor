import type { CategoryFlowRow } from "../services/api";

/** Sum all rows in `year` (YYYY) into one row per (parent_category, sub_category). */
export function aggregateYearIntoRows(allRows: CategoryFlowRow[], year: string): CategoryFlowRow[] {
  const map = new Map<string, CategoryFlowRow>();
  for (const r of allRows) {
    if (!r.month.startsWith(year)) continue;
    const k = `${r.parent_category}\t${r.sub_category}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        ...r,
        month: `${year}-06`,
      });
    } else {
      map.set(k, {
        ...prev,
        debit_total: prev.debit_total + r.debit_total,
        credit_total: prev.credit_total + r.credit_total,
        txn_count: prev.txn_count + r.txn_count,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.sub_category.localeCompare(b.sub_category));
}
