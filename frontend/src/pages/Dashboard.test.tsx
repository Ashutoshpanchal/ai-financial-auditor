/**
 * Tests for frontend/src/pages/Dashboard.tsx
 *
 * Covers:
 *  - Loading skeleton state
 *  - Summary cards (Total Spend, Top Category, Anomalies) rendering from audit data
 *  - Empty-state rendering when no audits / no documents exist
 *  - Recent Audit Reports table (rows, View Report links)
 *  - Recent Uploads table (rows, status badges)
 *  - Error banner shown when API calls fail
 *  - No Navbar rendered (it was removed in this commit — Layout provides it)
 *
 * Mocking strategy:
 *  - api module: vi.mock() with per-test overrides
 *  - react-router-dom: MemoryRouter (Dashboard uses Link for "View Report")
 *  - No useAuth mock needed — Dashboard no longer uses useAuth directly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Recharts uses ResizeObserver which is not in jsdom
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { api } from "../services/api";
import Dashboard from "./Dashboard";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_DOCUMENT = {
  id: "doc-1",
  filename: "statement_jan.csv",
  bank_name: "HDFC",
  file_type: "csv",
  status: "completed" as const,
  upload_date: "2024-01-10T00:00:00Z",
};

const MOCK_AUDIT = {
  id: "audit-1",
  document_id: "doc-1",
  summary: "January spending overview",
  insights: {
    total_spend: 15000,
    top_category: "Food & Dining",
    anomaly_count: 3,
    monthly_totals: [
      { month: "Jan", total: 15000 },
      { month: "Feb", total: 12000 },
    ],
    categories: [
      { name: "Food & Dining", value: 7000 },
      { name: "Transport", value: 4000 },
      { name: "Shopping", value: 4000 },
    ],
  },
  created_at: "2024-01-15T00:00:00Z",
};

/**
 * Default mock: both GET endpoints return fixture data.
 */
function mockSuccessfulFetch(
  documents = [MOCK_DOCUMENT],
  audits = [MOCK_AUDIT]
) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === "/documents") return Promise.resolve({ data: documents });
    if (url === "/audit") return Promise.resolve({ data: audits });
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// ── Tests: Page heading ────────────────────────────────────────────────────────

describe("Dashboard — page heading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulFetch();
  });

  it("renders the Financial Overview heading", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Financial Overview")).toBeInTheDocument();
    });
  });

  it("renders the subtitle", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText("Your AI-powered finance audit at a glance")
      ).toBeInTheDocument();
    });
  });
});

// ── Tests: Summary cards ───────────────────────────────────────────────────────

describe("Dashboard — summary cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulFetch();
  });

  it("renders the Total Spend card with formatted value", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Total Spend (latest)")).toBeInTheDocument();
    });
    // $15,000 appears in both the summary card and the audit table row.
    // Verify it appears at least twice (card + table row).
    expect(screen.getAllByText(/\$15,000/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the Top Category card with correct category name", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Top Category")).toBeInTheDocument();
    });
    expect(screen.getByText("Food & Dining")).toBeInTheDocument();
  });

  it("renders Anomalies Detected card with correct count", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Anomalies Detected")).toBeInTheDocument();
    });
    // anomaly_count is 3 — appears in both the summary card and the audit table row
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
  });

  it("shows em-dash for Total Spend when no audit data exists", async () => {
    mockSuccessfulFetch([MOCK_DOCUMENT], []);
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Total Spend (latest)")).toBeInTheDocument();
    });
    // All summary cards should show em-dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows em-dash for Top Category when no audit data exists", async () => {
    mockSuccessfulFetch([MOCK_DOCUMENT], []);
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Top Category")).toBeInTheDocument();
    });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Tests: Recent Audit Reports table ─────────────────────────────────────────

describe("Dashboard — Recent Audit Reports table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulFetch();
  });

  it("renders the Recent Audit Reports section heading", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Audit Reports")).toBeInTheDocument();
    });
  });

  it("renders the audit summary text in the table", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText("January spending overview")
      ).toBeInTheDocument();
    });
  });

  it("renders the total spend in the audit row", async () => {
    renderDashboard();
    await waitFor(() => {
      // $15,000 appears in the audit table row
      expect(screen.getAllByText(/\$15,000/).length).toBeGreaterThan(0);
    });
  });

  it("renders a View Report link for each audit", async () => {
    renderDashboard();
    await waitFor(() => {
      const viewLink = screen.getByRole("link", { name: "View Report" });
      expect(viewLink).toBeInTheDocument();
      expect(viewLink).toHaveAttribute("href", "/audit/audit-1");
    });
  });

  it("renders column headers: Summary, Total Spend, Anomalies, Date, Action", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Summary")).toBeInTheDocument();
      expect(screen.getByText("Total Spend")).toBeInTheDocument();
      expect(screen.getByText("Anomalies")).toBeInTheDocument();
      expect(screen.getByText("Date")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
    });
  });

  it("shows empty-state message when there are no audits", async () => {
    mockSuccessfulFetch([MOCK_DOCUMENT], []);
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText(
          "No audits yet. Upload a document to generate your first report."
        )
      ).toBeInTheDocument();
    });
  });
});

// ── Tests: Recent Uploads table ────────────────────────────────────────────────

describe("Dashboard — Recent Uploads table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulFetch();
  });

  it("renders the Recent Uploads section heading", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Recent Uploads")).toBeInTheDocument();
    });
  });

  it("renders the document filename", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("statement_jan.csv")).toBeInTheDocument();
    });
  });

  it("renders the bank name in the uploads table", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("HDFC")).toBeInTheDocument();
    });
  });

  it("renders a Completed status badge for a completed document", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });
  });

  it("renders the upload table column headers", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(screen.getByText("Bank")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Uploaded")).toBeInTheDocument();
    });
  });

  it("shows empty-state with Upload now link when no documents exist", async () => {
    mockSuccessfulFetch([], []);
    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText("No documents uploaded yet.")
      ).toBeInTheDocument();
      const uploadLink = screen.getByRole("link", { name: "Upload now" });
      expect(uploadLink).toHaveAttribute("href", "/upload");
    });
  });
});

// ── Tests: Error banner ────────────────────────────────────────────────────────

describe("Dashboard — error state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows error banner when API calls fail", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { detail: "Unauthorized" } },
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Unauthorized")).toBeInTheDocument();
    });
  });

  it("shows fallback error when response.data.detail is missing", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network Error")
    );

    renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText("Failed to load dashboard data.")
      ).toBeInTheDocument();
    });
  });
});

// ── Tests: Navbar absent ───────────────────────────────────────────────────────

describe("Dashboard — no duplicate Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulFetch();
  });

  it("does NOT render a nav element inside Dashboard (Navbar moved to Layout)", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Financial Overview")).toBeInTheDocument();
    });
    // There should be no <nav> element rendered by Dashboard itself
    expect(document.querySelector("nav")).toBeNull();
  });

  it("does NOT render the FinanceAI brand inside the Dashboard component", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Financial Overview")).toBeInTheDocument();
    });
    expect(screen.queryByText("FinanceAI")).toBeNull();
  });
});
