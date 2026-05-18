import { describe, expect, it } from "vitest";
import {
  buildCalendarWeeks,
  compareIso,
  isIsoDateDisabled,
  parseIsoDate,
  toIsoDateLocal,
} from "./calendarGrid";

describe("calendarGrid", () => {
  it("toIsoDateLocal formats local date", () => {
    expect(toIsoDateLocal(new Date(2026, 4, 18))).toBe("2026-05-18");
  });

  it("parseIsoDate round-trips", () => {
    const d = parseIsoDate("2024-03-15");
    expect(d).not.toBeNull();
    expect(toIsoDateLocal(d!)).toBe("2024-03-15");
  });

  it("buildCalendarWeeks returns 6 weeks of 7 days", () => {
    const w = buildCalendarWeeks(2026, 0);
    expect(w).toHaveLength(6);
    expect(w[0]).toHaveLength(7);
  });

  it("January 2026 starts with Dec 29 Mon in first cell (Monday grid)", () => {
    const w = buildCalendarWeeks(2026, 0);
    expect(w[0][0].iso).toBe("2025-12-29");
    expect(w[0][0].inCurrentMonth).toBe(false);
    expect(w[1][0].inCurrentMonth).toBe(true);
  });

  it("compareIso orders strings", () => {
    expect(compareIso("2024-01-01", "2024-02-01")).toBeLessThan(0);
  });

  it("isIsoDateDisabled respects bounds", () => {
    expect(isIsoDateDisabled("2024-06-01", "2024-06-01", "2024-06-30")).toBe(false);
    expect(isIsoDateDisabled("2024-05-31", "2024-06-01", "2024-06-30")).toBe(true);
  });
});
