/**
 * Tests for frontend/src/pages/Dashboard.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../contexts/ThemeContext";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Test User" } }),
}));

vi.mock("../hooks/useTransactionDateScope", () => ({
  useTransactionDateScope: () => ({
    scope: null,
    defaultRange: { from: "2024-04-01", to: "2025-03-31" },
    loading: false,
    bankNames: ["HDFC"],
    categoryMaster: {},
  }),
}));

vi.mock("../components/dashboard/WidgetGrid", () => ({
  WidgetGrid: () => <div data-testid="widget-grid">WidgetGrid</div>,
}));

vi.mock("../components/dashboard/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));

import Dashboard from "./Dashboard";

const WIDGETS = [
  { id: "w1", title: "Total Credits", widget_type: "metric", query_config: {}, is_default: true },
];
const LAYOUT = { cols: 3, grid: [{ widget_id: "w1", row: 0, col: 0, col_span: 1 }] };

function makeFetch(responses: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(responses).find((k) => (url as string).includes(k));
    const body = key ? responses[key] : {};
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    });
  });
}

function renderDashboard() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons while fetching", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderDashboard();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders widget grid and filter bar after data loads", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/widgets": WIDGETS,
        "/dashboard/layout": LAYOUT,
      }),
    );

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("widget-grid")).toBeInTheDocument());
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("shows Spending overview heading and filter summary", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/widgets": WIDGETS,
        "/dashboard/layout": LAYOUT,
      }),
    );

    renderDashboard();
    await waitFor(() => screen.getByText("Spending overview"));
    expect(screen.getByText(/Test User/)).toBeInTheDocument();
    expect(screen.queryByText("Finance Assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Add Widgets")).not.toBeInTheDocument();
  });

  it("toggles edit mode via Edit button", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/widgets": WIDGETS,
        "/dashboard/layout": LAYOUT,
      }),
    );

    renderDashboard();
    await waitFor(() => screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
