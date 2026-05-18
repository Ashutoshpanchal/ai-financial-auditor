/** Draft widget state for Widget Studio — aligned with backend validate_widget_query_config rules. */

export type WidgetType =
  | "metric"
  | "spend_receive_pair"
  | "bar_chart"
  | "pie_chart"
  | "line_chart";

export type ColSpan = 1 | 2 | 3;

export interface WidgetQueryConfig {
  aggregation?: string;
  field?: string;
  group_by?: string;
  filters?: Record<string, string | null>;
  format?: string;
  raw_metric_sql?: string;
  template?: string;
}

export interface WidgetDraft {
  title: string;
  widget_type: WidgetType;
  query_config: WidgetQueryConfig;
  col_span: ColSpan;
}

export interface WidgetSuggestion {
  title: string;
  widget_type: WidgetType;
  query_config: Record<string, unknown>;
}

const AGG = new Set(["sum", "count", "avg", "max", "min"]);
const FIELDS = new Set(["credit", "debit"]);
const GROUPS = new Set(["month", "day", "category", "bank_name"]);
const PLACEHOLDERS = new Set([
  "{{date_from}}",
  "{{date_to}}",
  "{{bank_name}}",
  "{{category}}",
  "{{parent_category}}",
  "{{sub_category}}",
]);
const TYPES: Set<WidgetType> = new Set([
  "metric",
  "spend_receive_pair",
  "bar_chart",
  "pie_chart",
  "line_chart",
]);

export function makeInitialWidgetDraft(): WidgetDraft {
  return {
    title: "New widget",
    widget_type: "metric",
    query_config: {
      aggregation: "sum",
      field: "debit",
      format: "currency",
    },
    col_span: 1,
  };
}

/** Merge an assistant widget_suggestion into the draft (replaces title, type, config). */
export function mergeWidgetSuggestion(draft: WidgetDraft, suggestion: WidgetSuggestion): WidgetDraft {
  const qc = { ...suggestion.query_config } as WidgetQueryConfig;
  const wt = TYPES.has(suggestion.widget_type) ? suggestion.widget_type : draft.widget_type;
  return {
    ...draft,
    title: suggestion.title?.trim() || draft.title,
    widget_type: wt,
    query_config: qc,
  };
}

function isNonEmptyRawSql(cfg: WidgetQueryConfig): boolean {
  return typeof cfg.raw_metric_sql === "string" && cfg.raw_metric_sql.trim().length > 0;
}

/** Return an error message or null if the draft can be sent to POST /dashboard/widgets/preview. */
export function validateDraftForPreview(draft: WidgetDraft): string | null {
  if (!draft.title.trim()) {
    return "Title is required.";
  }
  if (!TYPES.has(draft.widget_type)) {
    return "Invalid widget type.";
  }

  const cfg = draft.query_config;

  if (draft.widget_type === "spend_receive_pair") {
    if (cfg.template != null && cfg.template !== "spend_receive_pair") {
      return "template must be spend_receive_pair.";
    }
    if (cfg.aggregation || cfg.field || cfg.group_by || isNonEmptyRawSql(cfg)) {
      return "spend_receive_pair must not use aggregation, field, group_by, or raw SQL.";
    }
    const txn = cfg.filters?.transaction_type;
    if (txn != null && txn !== "") {
      return "spend_receive_pair must not set filters.transaction_type.";
    }
    return null;
  }

  if (isNonEmptyRawSql(cfg)) {
    if (draft.widget_type !== "metric") {
      return "Raw SQL is only allowed for metric widgets.";
    }
    if (cfg.group_by != null && String(cfg.group_by).length > 0) {
      return "Remove group_by when using raw_metric_sql.";
    }
    return null;
  }

  const agg = cfg.aggregation ?? "";
  const field = cfg.field ?? "";
  if (!AGG.has(agg)) {
    return `Invalid aggregation (allowed: ${[...AGG].join(", ")}).`;
  }
  if (!FIELDS.has(field)) {
    return `Invalid field (allowed: ${[...FIELDS].join(", ")}).`;
  }

  const gb = cfg.group_by;
  if (draft.widget_type === "metric") {
    if (gb != null && String(gb).length > 0) {
      return "Metric widgets must not use group_by.";
    }
  } else {
    if (gb == null || !GROUPS.has(String(gb))) {
      return `Chart widgets require group_by (${[...GROUPS].join(", ")}).`;
    }
  }

  const txn = cfg.filters?.transaction_type;
  if (txn != null && txn !== "" && txn !== "credit" && txn !== "debit") {
    return "filters.transaction_type must be credit, debit, or empty.";
  }

  if (cfg.filters) {
    for (const [key, val] of Object.entries(cfg.filters)) {
      if (val == null || val === "") continue;
      if (typeof val !== "string") {
        return `filters.${key} must be a string.`;
      }
      if (PLACEHOLDERS.has(val)) continue;
      if (key === "transaction_type" && (val === "credit" || val === "debit")) continue;
      if (/^\{\{[a-z_]+\}\}$/.test(val)) {
        return `Unknown placeholder in filters.${key}: ${val}`;
      }
    }
  }

  return null;
}

/** Stable JSON for comparing draft versions (preview / save guards). */
export function draftPreviewKey(draft: WidgetDraft, filters: Record<string, string>): string {
  return JSON.stringify({
    title: draft.title,
    widget_type: draft.widget_type,
    query_config: draft.query_config,
    filters,
  });
}
