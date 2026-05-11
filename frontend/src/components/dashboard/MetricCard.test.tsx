import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("renders title and formatted currency value", () => {
    render(<MetricCard title="Total Credits" value={12345.67} format="currency" />);
    expect(screen.getByText("Total Credits")).toBeInTheDocument();
    expect(screen.getByText(/[\d,]+\.\d{2}/)).toBeInTheDocument();
  });

  it("renders number format without currency symbol", () => {
    render(<MetricCard title="Count" value={1000} format="number" />);
    expect(screen.getByText("1,000")).toBeInTheDocument();
  });

  it("shows pulsing placeholder when isLoading is true", () => {
    const { container } = render(<MetricCard title="X" value={0} format="number" isLoading />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    render(<MetricCard title="X" value={0} format="number" error="Failed to load" />);
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders zero value correctly in number format", () => {
    render(<MetricCard title="X" value={0} format="number" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("prioritises loading over error when both set", () => {
    const { container } = render(
      <MetricCard title="X" value={0} format="number" isLoading error="oops" />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("oops")).not.toBeInTheDocument();
  });
});
