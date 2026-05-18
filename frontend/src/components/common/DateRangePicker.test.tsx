import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangePicker } from "./DateRangePicker";
import type { TransactionDateScope } from "../../utils/dateRangePresets";

const SCOPE: TransactionDateScope = {
  min_date: "2024-01-01",
  max_date: "2026-12-31",
  months_with_data: ["2024-01", "2026-04"],
  has_transactions: true,
};

describe("DateRangePicker", () => {
  it("renders trigger with preset label when range matches", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-04-01", to: "2026-04-30" }}
        onChange={vi.fn()}
        scope={SCOPE}
      />,
    );
    expect(screen.getByText("Last month")).toBeInTheDocument();
  });

  it("calls onChange when a preset is selected", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={{ from: "", to: "" }}
        onChange={onChange}
        scope={SCOPE}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Date range" }));
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(onChange).toHaveBeenCalled();
    const [range, preset] = onChange.mock.calls[0]!;
    expect(preset).toBe("this_year");
    expect(range.from).toBe("2026-01-01");
    expect(range.to).toBe("2026-12-31");
  });
});
