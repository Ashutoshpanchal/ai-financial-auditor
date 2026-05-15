import type { CategoryFlowRow } from "../services/api";

const rowKey = (r: CategoryFlowRow) => `${r.month}\t${r.sub_category}\t${r.parent_category}`;

/** Merge category-flow rows; sums amounts for duplicate month/sub/parent keys. */
export function mergeCategoryFlowRows(existing: CategoryFlowRow[], incoming: CategoryFlowRow[]): CategoryFlowRow[] {
  const map = new Map<string, CategoryFlowRow>();
  for (const r of existing) {
    map.set(rowKey(r), { ...r });
  }
  for (const r of incoming) {
    const k = rowKey(r);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...r });
    } else {
      map.set(k, {
        ...prev,
        debit_total: prev.debit_total + r.debit_total,
        credit_total: prev.credit_total + r.credit_total,
        txn_count: prev.txn_count + r.txn_count,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.sub_category.localeCompare(b.sub_category),
  );
}

export function totalsFromRows(rows: CategoryFlowRow[]): {
  debit: number;
  credit: number;
  txn_count: number;
} {
  let debit = 0;
  let credit = 0;
  let txn_count = 0;
  for (const r of rows) {
    debit += r.debit_total;
    credit += r.credit_total;
    txn_count += r.txn_count;
  }
  return { debit, credit, txn_count };
}

/** Earliest YYYY-MM in rows, or null. */
export function minMonth(rows: CategoryFlowRow[]): string | null {
  if (!rows.length) return null;
  return rows.reduce((a, b) => (a.month <= b.month ? a : b)).month;
}

/** ISO date YYYY-MM-DD for first day strictly before the given YYYY-MM. */
export function dayBeforeMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setDate(d.getDate() - 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** ISO date YYYY-MM-DD for first day of month `ym` minus `n` months. */
export function monthStartMinusMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}
