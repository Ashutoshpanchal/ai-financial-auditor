/** Left/right compare selection: calendar month or full calendar year. */
export type CompareAnchor =
  | { kind: "month"; ym: string }
  | { kind: "year"; year: string };

export function formatCompareAnchorLabel(
  a: CompareAnchor,
  formatMonthLabel: (ym: string) => string,
): string {
  if (a.kind === "month") return formatMonthLabel(a.ym);
  return a.year;
}
