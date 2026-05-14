/**
 * Tests for the transaction table in Upload.tsx.
 * Covers the debit/credit two-column layout introduced in the TransactionRow interface change.
 *
 * Mocking strategy:
 *  - useAuth hook: returns a minimal user object so Navbar renders without errors.
 *  - api module: controls what /documents and /documents/transactions/all return.
 *  - react-router-dom: wraps component in MemoryRouter to satisfy Link/NavLink.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@example.com", name: "Test User", role: "user" },
    loading: false,
    logout: vi.fn(),
  }),
}));

// We mock the api module at module level; individual tests override per-call below.
vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import { api } from "../services/api";
import Upload from "./Upload";

/**
 * Build a minimal TransactionRow fixture with debit/credit values.
 */
function makeTransaction(overrides: Partial<{
  id: string;
  bank_name: string;
  transaction_date: string;
  description: string;
  debit: number;
  credit: number;
  category: string | null;
  remarks: Record<string, string> | null;
}> = {}) {
  return {
    id: "txn-1",
    bank_name: "HDFC",
    transaction_date: "2024-01-15T00:00:00Z",
    description: "Test transaction",
    debit: 0,
    credit: 0,
    category: null,
    remarks: null,
    ...overrides,
  };
}

/**
 * Render Upload inside a MemoryRouter (required by NavLink / Link).
 */
function renderUpload() {
  return render(
    <MemoryRouter>
      <Upload />
    </MemoryRouter>
  );
}

/**
 * Configure the api.get mock to return:
 *   - an empty document list for /documents
 *   - the supplied transactions for /documents/transactions/all
 */
function mockApiWithTransactions(transactions: ReturnType<typeof makeTransaction>[]) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === "/documents") {
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith("/documents/transactions/all")) {
      return Promise.resolve({
        data: { items: transactions, total: transactions.length },
      });
    }
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Upload page — transaction table column headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiWithTransactions([makeTransaction({ debit: 500, credit: 0 })]);
  });

  it("renders a Debit column header (not Amount)", async () => {
    renderUpload();

    // Wait for the async data fetch to complete and the table to appear
    await waitFor(() => {
      expect(screen.getByText("Debit")).toBeInTheDocument();
    });
  });

  it("renders a Credit column header (not Amount)", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Credit")).toBeInTheDocument();
    });
  });

  it("does not render an Amount column header", async () => {
    renderUpload();

    await waitFor(() => {
      // Wait for at least one known column to confirm the table is present
      expect(screen.getByText("Debit")).toBeInTheDocument();
    });

    expect(screen.queryByText("Amount")).toBeNull();
  });

  it("renders a Category column header", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    });
  });
});

describe("Upload page — debit transaction row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiWithTransactions([
      makeTransaction({ id: "txn-debit", debit: 1500.5, credit: 0, description: "Electricity bill" }),
    ]);
  });

  it("shows the debit amount in red under the Debit column", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Debit")).toBeInTheDocument();
    });

    // The debit amount should be rendered; toLocaleString in en-IN for 1500.50
    // The text content will contain the rupee symbol and the formatted amount.
    const debitCell = screen.getByText((content) =>
      content.includes("1,500.50") || content.includes("1500.50")
    );
    expect(debitCell).toBeInTheDocument();
    expect(debitCell).toHaveClass("text-red-600");
  });

  it("shows an em-dash placeholder under the Credit column for a debit row", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Debit")).toBeInTheDocument();
    });

    // There should be at least one em-dash (—) in the row — it sits in the Credit cell
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);

    // The dash for the Credit column should have the muted gray style
    const creditDash = dashes.find((el) => el.classList.contains("text-gray-300"));
    expect(creditDash).toBeDefined();
  });
});

describe("Upload page — category column and sync button", () => {
  it("shows None in the category cell and a Sync categories button when category is null", async () => {
    mockApiWithTransactions([makeTransaction({ id: "txn-a", category: null })]);
    renderUpload();

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    });

    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync categories" })).toBeInTheDocument();
  });

  it("hides Sync categories when every row on the page has a category", async () => {
    mockApiWithTransactions([
      makeTransaction({ id: "txn-1", category: "Bills / Electricity" }),
    ]);
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Bills / Electricity")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Sync categories" })).toBeNull();
  });

  it("shows Sync categories if any row on the page lacks a category", async () => {
    mockApiWithTransactions([
      makeTransaction({ id: "txn-1", category: "Income / Salary" }),
      makeTransaction({ id: "txn-2", category: null, description: "Coffee" }),
    ]);
    renderUpload();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sync categories" })).toBeInTheDocument();
    });
  });
});

describe("Upload page — credit transaction row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiWithTransactions([
      makeTransaction({ id: "txn-credit", debit: 0, credit: 2500, description: "Salary" }),
    ]);
  });

  it("shows the credit amount in green under the Credit column", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Credit")).toBeInTheDocument();
    });

    const creditCell = screen.getByText((content) =>
      content.includes("2,500.00") || content.includes("2500.00")
    );
    expect(creditCell).toBeInTheDocument();
    expect(creditCell).toHaveClass("text-green-600");
  });

  it("shows an em-dash placeholder under the Debit column for a credit row", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Credit")).toBeInTheDocument();
    });

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);

    const debitDash = dashes.find((el) => el.classList.contains("text-gray-300"));
    expect(debitDash).toBeDefined();
  });
});

describe("Upload page — transaction row with both debit and credit zero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiWithTransactions([
      makeTransaction({ id: "txn-zero", debit: 0, credit: 0, description: "Zero transaction" }),
    ]);
  });

  it("shows em-dash under both Debit and Credit columns when both are zero", async () => {
    renderUpload();

    await waitFor(() => {
      expect(screen.getByText("Debit")).toBeInTheDocument();
    });

    // Both debit and credit cells should render em-dashes
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Upload page — transaction dropdown filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiWithTransactions([makeTransaction({ id: "txn-date-filter" })]);
  });

  it("sends date and amount filters after clicking Apply", async () => {
    renderUpload();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/documents/transactions/all?"));
    });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const fromInput = screen.getByLabelText("Transaction from date");
    const toInput = screen.getByLabelText("Transaction to date");
    fireEvent.change(fromInput, { target: { value: "2024-01-01" } });
    fireEvent.change(toInput, { target: { value: "2024-01-31" } });
    fireEvent.change(screen.getByLabelText("Transaction amount filter mode"), { target: { value: "between" } });
    fireEvent.change(screen.getByLabelText("Transaction amount from"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Transaction amount to"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Transaction amount operator"), { target: { value: ">=" } });
    fireEvent.change(screen.getByLabelText("Transaction amount compare value"), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const transactionCalls = (api.get as ReturnType<typeof vi.fn>).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/documents/transactions/all?"));
      const latestCall = transactionCalls[transactionCalls.length - 1] ?? "";

      expect(latestCall).toContain("from_date=2024-01-01");
      expect(latestCall).toContain("to_date=2024-01-31");
      expect(latestCall).toContain("min_amount=1000");
      expect(latestCall).toContain("max_amount=5000");
      expect(latestCall).toContain("amount_operator=%3E%3D");
      expect(latestCall).toContain("amount_value=2500");
    });
  });
});
