/**
 * Full integration matrix for all date presets (debug verification suite).
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker } from "./DateRangePicker";
import {
  PICKER_PRESET_ORDER,
  PRESET_LABELS,
  applyPreset,
  type TransactionDateScope,
} from "../../utils/dateRangePresets";

const SCOPE: TransactionDateScope = {
  min_date: "2024-03-01",
  max_date: "2026-04-15",
  months_with_data: ["2024-03", "2026-04"],
  has_transactions: true,
};

const TODAY = new Date(2026, 4, 18);

function isFullScope(from: string, to: string): boolean {
  return from === SCOPE.min_date && to === SCOPE.max_date;
}

describe("DateRangePicker full preset matrix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const preset of PICKER_PRESET_ORDER) {
    it(`applyPreset: ${preset} returns valid ordered range`, () => {
      const applied = applyPreset(preset, SCOPE, TODAY);
      expect(applied).not.toBeNull();
      expect(applied!.from <= applied!.to).toBe(true);
    });
  }

  it("last_week is not expanded to full transaction scope", () => {
    const applied = applyPreset("last_week", SCOPE, TODAY)!;
    expect(isFullScope(applied.from, applied.to)).toBe(false);
    expect(applied).toEqual({ from: "2026-04-09", to: "2026-04-15" });
  });

  it("today and yesterday use calendar days, not max_date", () => {
    expect(applyPreset("today", SCOPE, TODAY)).toEqual({ from: "2026-05-18", to: "2026-05-18" });
    expect(applyPreset("yesterday", SCOPE, TODAY)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("last_month intersects partial April", () => {
    const applied = applyPreset("last_month", SCOPE, TODAY)!;
    expect(applied).toEqual({ from: "2026-04-01", to: "2026-04-15" });
  });

  for (const preset of ["today", "yesterday", "last_week", "last_month", "this_year"] as const) {
    it(`UI commits ${preset} via onChange`, () => {
      const onChange = vi.fn();
      render(
        <DateRangePicker
          value={{ from: "", to: "" }}
          onChange={onChange}
          scope={SCOPE}
          applyMode="live"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Date range" }));
      fireEvent.click(screen.getByRole("button", { name: PRESET_LABELS[preset] }));
      expect(onChange).toHaveBeenCalled();
      const [range] = onChange.mock.calls[0]!;
      const expected = applyPreset(preset, SCOPE, TODAY)!;
      expect(range).toEqual(expected);
    });
  }
});
