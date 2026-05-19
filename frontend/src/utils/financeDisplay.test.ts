import { describe, expect, it } from "vitest";
import {
  formatCompactK,
  formatINR,
  formatLakh,
  monthShortLabel,
  percentOf,
  quarterFromYearMonth,
  ringDasharray,
  rollupQuarters,
} from "./financeDisplay";

describe("financeDisplay", () => {
  it("formatINR prefixes rupee and uses en-IN grouping", () => {
    expect(formatINR(700574)).toBe("₹7,00,574");
  });

  it("formatLakh shows L suffix", () => {
    expect(formatLakh(700_000)).toBe("7.00L");
  });

  it("formatCompactK rounds to k", () => {
    expect(formatCompactK(42_000)).toBe("42k");
  });

  it("quarterFromYearMonth maps Indian FY", () => {
    expect(quarterFromYearMonth(4)).toBe("Q1");
    expect(quarterFromYearMonth(1)).toBe("Q4");
  });

  it("rollupQuarters aggregates monthly debits", () => {
    const q = rollupQuarters([
      { label: "2024-04", debit: 100 },
      { label: "2024-07", debit: 200 },
    ]);
    expect(q.find((x) => x.label === "Q1")?.debit).toBe(100);
    expect(q.find((x) => x.label === "Q2")?.debit).toBe(200);
  });

  it("monthShortLabel returns month abbrev", () => {
    expect(monthShortLabel("2024-04")).toBe("APR");
  });

  it("ringDasharray scales to circumference", () => {
    const { dash, gap } = ringDasharray(50, 100);
    expect(dash).toBeGreaterThan(0);
    expect(dash + gap).toBeCloseTo(125.66, 0);
  });

  it("percentOf handles zero total", () => {
    expect(percentOf(10, 0)).toBe(0);
    expect(percentOf(25, 100)).toBe(25);
  });
});
