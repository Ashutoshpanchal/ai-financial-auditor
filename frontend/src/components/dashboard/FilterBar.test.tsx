import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar, FilterState } from "./FilterBar";

const EMPTY: FilterState = {
  dateFrom: "",
  dateTo: "",
  bankName: "",
  category: "",
  parentCategory: "",
  subCategory: "",
};

const DEFAULT_RANGE = { from: "2026-04-01", to: "2026-04-30" };

function renderBar(
  filters: FilterState = EMPTY,
  onChange = vi.fn(),
  extra: { defaultDateRange?: { from: string; to: string } | null } = {},
) {
  return render(
    <FilterBar
      filters={filters}
      onChange={onChange}
      defaultDateRange={extra.defaultDateRange ?? null}
    />,
  );
}

describe("FilterBar", () => {
  it("renders date range picker, bank, category, and clear", () => {
    renderBar();
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByLabelText(/bank/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("calls onChange with updated bankName when bank input changes", () => {
    const onChange = vi.fn();
    renderBar(EMPTY, onChange);
    fireEvent.change(screen.getByLabelText(/bank/i), { target: { value: "ANZ" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bankName: "ANZ" }));
  });

  it("calls onChange with updated category when category input changes", () => {
    const onChange = vi.fn();
    renderBar(EMPTY, onChange);
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Food" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: "Food" }));
  });

  it("Clear resets filters and restores default date range when provided", () => {
    const onChange = vi.fn();
    const filled: FilterState = {
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      bankName: "ANZ",
      category: "Food",
      parentCategory: "Food & Dining",
      subCategory: "Restaurants",
    };
    renderBar(filled, onChange, { defaultDateRange: DEFAULT_RANGE });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      dateFrom: DEFAULT_RANGE.from,
      dateTo: DEFAULT_RANGE.to,
    });
  });

  it("reflects controlled bankName value in input", () => {
    const { rerender } = renderBar({ ...EMPTY, bankName: "HSBC" });
    expect(screen.getByLabelText(/bank/i)).toHaveValue("HSBC");
    rerender(
      <FilterBar filters={{ ...EMPTY, bankName: "ANZ" }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/bank/i)).toHaveValue("ANZ");
  });
});
