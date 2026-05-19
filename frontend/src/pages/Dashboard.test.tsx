/**
 * Tests for frontend/src/pages/Dashboard.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider, type Theme } from "../contexts/ThemeContext";

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

vi.mock("../components/dashboard/cards/DashboardOverview", () => ({
  DashboardOverview: () => <div data-testid="dashboard-overview">Overview</div>,
}));

vi.mock("../components/dashboard/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));

import Dashboard from "./Dashboard";

const OVERVIEW = {
  totals: {
    credits: 1000,
    debits: 800,
    credit_count: 5,
    debit_count: 10,
    net: 200,
  },
  by_month: [{ label: "2024-04", debit: 100 }],
  by_quarter: [
    { label: "Q1", debit: 100, months: "Apr–Jun" },
    { label: "Q2", debit: 0, months: "Jul–Sep" },
    { label: "Q3", debit: 0, months: "Oct–Dec" },
    { label: "Q4", debit: 0, months: "Jan–Mar" },
  ],
  top_categories: [{ label: "Food", value: 500 }],
  top_descriptions: [{ label: "ZOMATO", value: 200 }],
  investment_debits: 100,
};

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

function renderDashboard(initialTheme: Theme = "light") {
  if (initialTheme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
  localStorage.setItem("financeai-theme", initialTheme);
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

  it("shows editorial shell and filter bar", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/overview": OVERVIEW,
      }),
    );

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("filter-bar")).toBeInTheDocument());
    expect(screen.getByTestId("dashboard-overview")).toBeInTheDocument();
    expect(document.querySelector(".dashboard-editorial")).toBeTruthy();
  });

  it("applies light editorial class when theme is light", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/overview": OVERVIEW,
      }),
    );

    renderDashboard("light");

    await waitFor(() => expect(screen.getByTestId("dashboard-overview")).toBeInTheDocument());
    expect(document.querySelector(".dashboard-editorial--light")).toBeTruthy();
  });

  it("uses dark editorial shell when theme is dark", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/overview": OVERVIEW,
      }),
    );

    renderDashboard("dark");

    await waitFor(() => expect(screen.getByTestId("dashboard-overview")).toBeInTheDocument());
    const shell = document.querySelector(".dashboard-editorial");
    expect(shell).toBeTruthy();
    expect(shell?.classList.contains("dashboard-editorial--light")).toBe(false);
  });

  it("shows SPENDING OVERVIEW heading and user name", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/dashboard/overview": OVERVIEW,
      }),
    );

    renderDashboard();
    await waitFor(() => screen.getByText(/SPENDING/));
    expect(screen.getByText(/Test User/)).toBeInTheDocument();
  });
});
