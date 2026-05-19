import { describe, expect, it } from "vitest";
import {
  applyPreset,
  clampRangeToScope,
  getPresetRange,
  resolveDefaultRange,
  type TransactionDateScope,
} from "./dateRangePresets";

const SCOPE: TransactionDateScope = {
  min_date: "2024-03-01",
  max_date: "2026-04-15",
  months_with_data: ["2024-03", "2024-04", "2026-04"],
  has_transactions: true,
};

const TODAY = new Date(2026, 4, 18); // 18 May 2026

describe("getPresetRange", () => {
  it("returns today as single day", () => {
    expect(getPresetRange("today", TODAY)).toEqual({ from: "2026-05-18", to: "2026-05-18" });
  });

  it("returns yesterday as single day", () => {
    expect(getPresetRange("yesterday", TODAY)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("returns last 7 days inclusive", () => {
    expect(getPresetRange("last_7_days", TODAY)).toEqual({ from: "2026-05-12", to: "2026-05-18" });
  });

  it("returns last 30 days inclusive", () => {
    expect(getPresetRange("last_30_days", TODAY)).toEqual({ from: "2026-04-19", to: "2026-05-18" });
  });

  it("returns last week as Mon–Sun ISO week before current week", () => {
    expect(getPresetRange("last_week", TODAY)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
  });

  it("returns last month bounds", () => {
    const r = getPresetRange("last_month", TODAY);
    expect(r).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("returns this year bounds", () => {
    const r = getPresetRange("this_year", TODAY);
    expect(r).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("returns last quarter when in Q2", () => {
    const r = getPresetRange("last_quarter", TODAY);
    expect(r).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
});

describe("clampRangeToScope", () => {
  it("clamps to min and max dates", () => {
    const r = clampRangeToScope("2020-01-01", "2030-12-31", SCOPE);
    expect(r).toEqual({ from: "2024-03-01", to: "2026-04-15" });
  });

  it("treats missing end as same day as start for comparison", () => {
    const r = clampRangeToScope("2024-06-10", "", SCOPE);
    expect(r).toEqual({ from: "2024-06-10", to: "2024-06-10" });
  });

  it("intersects partial overlap without expanding to full scope", () => {
    const r = clampRangeToScope("2026-04-01", "2026-04-30", SCOPE);
    expect(r).toEqual({ from: "2026-04-01", to: "2026-04-15" });
  });

  it("slides last-week-length window when preset is entirely after max_date", () => {
    const r = clampRangeToScope("2026-05-11", "2026-05-17", SCOPE);
    expect(r).toEqual({ from: "2026-04-09", to: "2026-04-15" });
  });
});

describe("resolveDefaultRange", () => {
  it("picks last month with data when last calendar month is empty", () => {
    const scope: TransactionDateScope = {
      ...SCOPE,
      months_with_data: ["2024-03", "2026-04"],
    };
    const r = resolveDefaultRange(scope, TODAY);
    expect(r).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("walks back to earlier month when needed", () => {
    const scope: TransactionDateScope = {
      ...SCOPE,
      months_with_data: ["2024-03"],
    };
    const r = resolveDefaultRange(scope, TODAY);
    expect(r).toEqual({ from: "2024-03-01", to: "2024-03-31" });
  });

  it("returns null when no transactions", () => {
    expect(resolveDefaultRange({ ...SCOPE, has_transactions: false, months_with_data: [] })).toBeNull();
  });
});

describe("applyPreset", () => {
  it("yesterday uses same from and to when inside scope", () => {
    const wide: TransactionDateScope = { ...SCOPE, max_date: "2026-12-31" };
    const r = applyPreset("yesterday", wide, TODAY);
    expect(r).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("yesterday stays on calendar day when after last transaction", () => {
    const r = applyPreset("yesterday", SCOPE, TODAY);
    expect(r).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("today stays on calendar day when after last transaction", () => {
    const r = applyPreset("today", SCOPE, TODAY);
    expect(r).toEqual({ from: "2026-05-18", to: "2026-05-18" });
  });

  it("today snaps to min_date when calendar today is before first transaction", () => {
    const futureToday = new Date(2024, 1, 15);
    const r = applyPreset("today", SCOPE, futureToday);
    expect(r).toEqual({ from: "2024-03-01", to: "2024-03-01" });
  });

  it("last week preserves 7-day span anchored to max_date when calendar week is after data", () => {
    const r = applyPreset("last_week", SCOPE, TODAY);
    expect(r).toEqual({ from: "2026-04-09", to: "2026-04-15" });
  });

  it("last month intersects to partial month inside scope", () => {
    const r = applyPreset("last_month", SCOPE, TODAY);
    expect(r).toEqual({ from: "2026-04-01", to: "2026-04-15" });
  });

  it("clamps wide preset to scope bounds when partially overlapping", () => {
    const narrow: TransactionDateScope = {
      min_date: "2024-03-10",
      max_date: "2024-03-12",
      months_with_data: ["2024-03"],
      has_transactions: true,
    };
    const r = applyPreset("this_year", narrow, new Date(2026, 0, 15));
    expect(r).not.toBeNull();
    expect(r!.from).toBe("2024-03-10");
    expect(r!.to).toBe("2024-03-12");
  });
});
