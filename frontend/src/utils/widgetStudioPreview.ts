import type { WidgetStudioPreview, WidgetStudioPreviewData } from "../types/widgetStudio";

export interface ChartPoint {
  label: string;
  value: number;
}

/** Map API row objects to chart label/value pairs. */
export function rowsToChartData(rows: Record<string, unknown>[] | undefined): ChartPoint[] {
  if (!rows?.length) return [];
  return rows.map((row, i) => {
    const keys = Object.keys(row);
    const labelKey =
      keys.find((k) => /label|name|month|category|period|date/i.test(k)) ?? keys[0];
    const valueKey =
      keys.find((k) => /value|amount|total|sum|debit|credit/i.test(k) && k !== labelKey) ??
      keys.find((k) => typeof row[k] === "number") ??
      keys[1];
    const label = row[labelKey] != null ? String(row[labelKey]) : `Item ${i + 1}`;
    const value = Number(row[valueKey ?? "value"] ?? 0);
    return { label, value: Number.isFinite(value) ? value : 0 };
  });
}

export function previewHasData(preview: WidgetStudioPreview | null): boolean {
  if (!preview?.data) return false;
  if (preview.data.scalar != null) return true;
  return (preview.data.rows?.length ?? 0) > 0;
}

export function metricValueFromPreview(data: WidgetStudioPreviewData | undefined): number {
  if (data?.scalar != null) return data.scalar;
  const row = data?.rows?.[0];
  if (!row) return 0;
  const num = Object.values(row).find((v) => typeof v === "number");
  return typeof num === "number" ? num : 0;
}

const TYPE_LABEL: Record<string, string> = {
  metric: "Metric",
  bar: "Bar",
  line: "Line",
  pie: "Pie",
  multibar: "Multi-bar",
};

export function studioTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function chartChipLabel(type: string): string {
  const map: Record<string, string> = {
    metric: "Metric",
    bar: "Bar chart",
    line: "Line chart",
    pie: "Pie chart",
    multibar: "Multi-bar chart",
  };
  return map[type] ?? type;
}
