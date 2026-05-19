import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar, FilterState } from "./FilterBar";

const EMPTY: FilterState = {
  dateFrom: "",
  dateTo: "",
  bankNames: [],
  parentCategory: "",
  subCategories: [],
};

const DEFAULT_RANGE = { from: "2026-04-01", to: "2026-04-30" };

function renderBar(
  filters: FilterState = EMPTY,
  onChange = vi.fn(),
  extra: {
    defaultDateRange?: { from: string; to: string } | null;
    bankOptions?: string[];
  } = {},
) {
  return render(
    <FilterBar
      filters={filters}
      onChange={onChange}
      bankOptions={extra.bankOptions}
      defaultDateRange={extra.defaultDateRange ?? null}
    />,
  );
}

describe("FilterBar", () => {
  it("renders date range picker, bank, and clear", () => {
    renderBar();
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByLabelText(/^bank$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("calls onChange with updated bankName when bank input changes", () => {
    const onChange = vi.fn();
    renderBar(EMPTY, onChange);
    fireEvent.change(screen.getByLabelText(/^bank$/i), { target: { value: "ANZ" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bankNames: ["ANZ"] }));
  });

  it("calls onChange with updated parentCategory when parent select changes", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={EMPTY}
        onChange={onChange}
        parentCategoryOptions={["Food & Dining", "Transport"]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/parent category/i), {
      target: { value: "Transport" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ parentCategory: "Transport" }),
    );
  });

  it("Clear resets filters and restores default date range when provided", () => {
    const onChange = vi.fn();
    const filled: FilterState = {
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      bankNames: ["ANZ"],
      parentCategory: "Food & Dining",
      subCategories: ["Restaurants"],
    };
    renderBar(filled, onChange, { defaultDateRange: DEFAULT_RANGE });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      dateFrom: DEFAULT_RANGE.from,
      dateTo: DEFAULT_RANGE.to,
    });
  });

  it("reflects controlled bankName value in input", () => {
    const { rerender } = renderBar({ ...EMPTY, bankNames: ["HSBC"] });
    expect(screen.getByLabelText(/^bank$/i)).toHaveValue("HSBC");
    rerender(
      <FilterBar filters={{ ...EMPTY, bankNames: ["ANZ"] }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/^bank$/i)).toHaveValue("ANZ");
  });

  it("renders bank as select when bankOptions provided and forwards changes", () => {
    const onChange = vi.fn();
    renderBar(EMPTY, onChange, { bankOptions: ["HDFC", "ICICI"] });
    const bankSelect = screen.getByLabelText(/^bank$/i);
    expect(bankSelect.tagName).toBe("SELECT");
    fireEvent.change(bankSelect, { target: { value: "ICICI" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bankNames: ["ICICI"] }));
  });

  it("reflects controlled bankName in select when bankOptions provided", () => {
    render(
      <FilterBar
        filters={{ ...EMPTY, bankNames: ["HDFC"] }}
        onChange={vi.fn()}
        bankOptions={["HDFC", "ICICI"]}
      />,
    );
    expect(screen.getByLabelText(/^bank$/i)).toHaveValue("HDFC");
  });

  it("shows Apply before Clear when onApply is provided", () => {
    const onApply = vi.fn();
    render(
      <FilterBar filters={EMPTY} onChange={vi.fn()} onApply={onApply} defaultDateRange={DEFAULT_RANGE} />,
    );
    const buttons = screen.getAllByRole("button");
    const applyIdx = buttons.findIndex((b) => b.textContent === "Apply");
    const clearIdx = buttons.findIndex((b) => b.textContent === "Clear");
    expect(applyIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThan(applyIdx);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();
  });
});
