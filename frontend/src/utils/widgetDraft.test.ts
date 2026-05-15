import { describe, expect, it } from "vitest";
import {
  makeInitialWidgetDraft,
  draftPreviewKey,
  mergeWidgetSuggestion,
  validateDraftForPreview,
  type WidgetDraft,
} from "./widgetDraftModel";

describe("widgetDraft", () => {
  it("makeInitialWidgetDraft validates", () => {
    expect(validateDraftForPreview(makeInitialWidgetDraft())).toBeNull();
  });

  it("mergeWidgetSuggestion replaces fields", () => {
    const d = makeInitialWidgetDraft();
    const next = mergeWidgetSuggestion(d, {
      title: "Spend by category",
      widget_type: "pie_chart",
      query_config: {
        aggregation: "sum",
        field: "debit",
        group_by: "category",
        format: "currency",
      },
    });
    expect(next.title).toBe("Spend by category");
    expect(next.widget_type).toBe("pie_chart");
    expect(next.query_config.group_by).toBe("category");
  });

  it("rejects metric with group_by", () => {
    const d: WidgetDraft = {
      ...makeInitialWidgetDraft(),
      query_config: { aggregation: "sum", field: "debit", group_by: "month" },
    };
    expect(validateDraftForPreview(d)).toContain("group_by");
  });

  it("rejects chart without group_by", () => {
    const d: WidgetDraft = {
      ...makeInitialWidgetDraft(),
      widget_type: "bar_chart",
      query_config: { aggregation: "sum", field: "debit" },
    };
    expect(validateDraftForPreview(d)).toContain("group_by");
  });

  it("allows raw_metric_sql for metric", () => {
    const d: WidgetDraft = {
      ...makeInitialWidgetDraft(),
      query_config: {
        raw_metric_sql: "SELECT COALESCE(SUM(debit), 0) FROM transactions WHERE debit > 0",
        format: "currency",
      },
    };
    expect(validateDraftForPreview(d)).toBeNull();
  });

  it("draftPreviewKey changes with filters", () => {
    const d = makeInitialWidgetDraft();
    expect(draftPreviewKey(d, { a: "1" })).not.toBe(draftPreviewKey(d, { a: "2" }));
  });

  it("accepts group_by day and placeholder filters", () => {
    const d: WidgetDraft = {
      title: "Daily spend",
      widget_type: "bar_chart",
      query_config: {
        aggregation: "sum",
        field: "debit",
        group_by: "day",
        format: "currency",
        filters: {
          date_from: "{{date_from}}",
          date_to: "{{date_to}}",
          parent_category: "{{parent_category}}",
        },
      },
      col_span: 1,
    };
    expect(validateDraftForPreview(d)).toBeNull();
  });
});
