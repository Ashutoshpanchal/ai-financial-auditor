import type { CategoryFlowRow } from "../services/api";

export interface CompareRow {
  sub_category: string;
  a: CategoryFlowRow | null;
  b: CategoryFlowRow | null;
}

/** All sub-categories present in either month, sorted. */
export function buildCompareRows(rowsA: CategoryFlowRow[], rowsB: CategoryFlowRow[]): CompareRow[] {
  const mapA = new Map(rowsA.map((r) => [r.sub_category, r]));
  const mapB = new Map(rowsB.map((r) => [r.sub_category, r]));
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  return [...keys]
    .sort((x, y) => x.localeCompare(y))
    .map((sub_category) => ({
      sub_category,
      a: mapA.get(sub_category) ?? null,
      b: mapB.get(sub_category) ?? null,
    }));
}
