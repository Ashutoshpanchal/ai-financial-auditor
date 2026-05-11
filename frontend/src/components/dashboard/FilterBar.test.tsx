import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar, FilterState } from "./FilterBar";

const EMPTY: FilterState = { dateFrom: "", dateTo: "", bankName: "", category: "" };

function renderBar(filters: FilterState = EMPTY, onChange = vi.fn()) {
  return render(<FilterBar filters={filters} onChange={onChange} />);
}

describe("FilterBar", () => {
  it("renders all four input fields and clear button", () => {
    renderBar();
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
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

  it("Clear button resets all fields to empty strings", () => {
    const onChange = vi.fn();
    const filled: FilterState = {
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      bankName: "ANZ",
      category: "Food",
    };
    renderBar(filled, onChange);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith({ dateFrom: "", dateTo: "", bankName: "", category: "" });
  });

  it("reflects controlled bankName value in input", () => {
    const { rerender } = renderBar({ ...EMPTY, bankName: "HSBC" });
    expect(screen.getByLabelText(/bank/i)).toHaveValue("HSBC");
    rerender(<FilterBar filters={{ ...EMPTY, bankName: "ANZ" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/bank/i)).toHaveValue("ANZ");
  });

  it("calls onChange with updated dateFrom when From input changes", () => {
    const onChange = vi.fn();
    renderBar(EMPTY, onChange);
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: "2024-01-01" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: "2024-01-01" }));
  });
});
