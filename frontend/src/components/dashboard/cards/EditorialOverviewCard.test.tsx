import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorialOverviewCard } from "./EditorialOverviewCard";
import type { DashboardOverviewData } from "../../../types/dashboardOverview";

const mockData: DashboardOverviewData = {
  totals: {
    credits: 700_574,
    debits: 680_419,
    credit_count: 138,
    debit_count: 1416,
    net: 20_155,
  },
  by_month: [],
  by_quarter: [
    { label: "Q1", debit: 100_000, months: "Apr–Jun" },
    { label: "Q2", debit: 50_000, months: "Jul–Sep" },
    { label: "Q3", debit: 200_000, months: "Oct–Dec" },
    { label: "Q4", debit: 30_000, months: "Jan–Mar" },
  ],
  top_categories: [],
  top_descriptions: [],
  investment_debits: 172_000,
};

describe("EditorialOverviewCard", () => {
  it("renders skeleton when loading", () => {
    const { container } = render(
      <EditorialOverviewCard data={null} isLoading periodLabel="FY" />,
    );
    expect(container.querySelector(".de-skeleton")).toBeTruthy();
  });

  it("renders credit total when loaded", () => {
    render(
      <EditorialOverviewCard data={mockData} isLoading={false} periodLabel="FY 2024–25" />,
    );
    expect(screen.getByText(/7,00,574/)).toBeInTheDocument();
    expect(screen.getByText(/Statement · FY 2024–25/)).toBeInTheDocument();
  });
});
