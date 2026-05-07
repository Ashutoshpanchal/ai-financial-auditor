/**
 * Tests for frontend/src/pages/Categories.tsx
 *
 * Covers:
 *  - Initial data loading (master, descriptions, payment-methods)
 *  - Category Dictionary section rendering
 *  - Add sub-category form (validation + success + duplicate error)
 *  - Delete sub-category button
 *  - Description Mappings table
 *  - Auto-Categorize button (loading state + success + failure)
 *  - Parent/sub/payment-method dropdowns in the mappings table
 *
 * Mocking strategy:
 *  - api module: vi.mock() — individual tests override per call with mockImplementation
 *  - useAuth hook: not used directly by Categories, but Navbar may need it — mocked for safety
 *  - react-router-dom: MemoryRouter not required (Categories has no Link/NavLink)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { api } from "../services/api";
import Categories from "./Categories";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MASTER_DATA = {
  "Food & Dining": [
    { id: "cm-1", sub_category: "Swiggy" },
    { id: "cm-2", sub_category: "Zomato" },
  ],
  Transport: [{ id: "cm-3", sub_category: "Uber" }],
};

const DESCRIPTION_MAPPINGS = [
  {
    id: "dc-1",
    description: "SWIGGY ORDER",
    parent_category: "Food & Dining",
    sub_category: "Swiggy",
    payment_method: "UPI",
    updated_at: "2024-01-15T10:00:00Z",
    updated_by: "user-1",
  },
  {
    id: "dc-2",
    description: "UBER TRIP",
    parent_category: "Transport",
    sub_category: "Uber",
    payment_method: "Credit Card",
    updated_at: null,
    updated_by: null,
  },
];

const PAYMENT_METHODS = [
  "UPI",
  "NEFT",
  "IMPS",
  "Net Banking",
  "Credit Card",
  "Debit Card",
  "Cheque",
  "Auto-debit",
  "Cash",
  "Salary Credit",
  "Other",
];

/**
 * Default mock: all three GET calls return fixture data.
 */
function mockAllGetCalls() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === "/categories/master") {
      return Promise.resolve({ data: MASTER_DATA });
    }
    if (url === "/categories/descriptions") {
      return Promise.resolve({ data: DESCRIPTION_MAPPINGS });
    }
    if (url === "/categories/payment-methods") {
      return Promise.resolve({ data: PAYMENT_METHODS });
    }
    return Promise.reject(new Error(`Unexpected GET: ${url}`));
  });
}

function renderCategories() {
  return render(<Categories />);
}

// ── Tests: Initial render & data loading ──────────────────────────────────────

describe("Categories page — initial render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("renders the page heading", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("Category Manager")).toBeInTheDocument();
    });
  });

  it("renders the Category Dictionary section heading", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("Category Dictionary")).toBeInTheDocument();
    });
  });

  it("renders the Description Mappings section heading", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("Description Mappings")).toBeInTheDocument();
    });
  });

  it("calls GET /categories/master on mount", async () => {
    renderCategories();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/categories/master");
    });
  });

  it("calls GET /categories/descriptions on mount", async () => {
    renderCategories();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/categories/descriptions");
    });
  });

  it("calls GET /categories/payment-methods on mount", async () => {
    renderCategories();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/categories/payment-methods");
    });
  });
});

// ── Tests: Category Dictionary section ────────────────────────────────────────

describe("Categories page — Category Dictionary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("renders parent category badges from master data", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getAllByText("Food & Dining").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Transport").length).toBeGreaterThan(0);
    });
  });

  it("renders sub-category chips for each parent", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getAllByText("Swiggy").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Zomato").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Uber").length).toBeGreaterThan(0);
    });
  });

  it("renders a delete (×) button for each sub-category", async () => {
    renderCategories();
    await waitFor(() => {
      // 3 sub-categories → 3 × buttons
      const deleteButtons = screen.getAllByTitle("Remove");
      expect(deleteButtons).toHaveLength(3);
    });
  });

  it("renders the Add button for the add-sub-category form", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
  });

  it("renders the Parent category input field", async () => {
    renderCategories();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Parent category (e.g. Food & Dining)"),
      ).toBeInTheDocument();
    });
  });

  it("renders the Sub-category input field", async () => {
    renderCategories();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Sub-category (e.g. Blinkit)"),
      ).toBeInTheDocument();
    });
  });
});

// ── Tests: Add sub-category form ──────────────────────────────────────────────

describe("Categories page — Add sub-category form validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("shows validation error when both fields are empty and Add is clicked", async () => {
    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Both fields are required.")).toBeInTheDocument();
  });

  it("shows validation error when only parent is filled", async () => {
    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Parent category (e.g. Food & Dining)"),
      { target: { value: "Food & Dining" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Both fields are required.")).toBeInTheDocument();
  });

  it("shows validation error when only sub-category is filled", async () => {
    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Sub-category (e.g. Blinkit)"),
      { target: { value: "Blinkit" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Both fields are required.")).toBeInTheDocument();
  });

  it("calls POST /categories/master with correct payload when both fields are filled", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Parent category (e.g. Food & Dining)"),
      { target: { value: "Shopping" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sub-category (e.g. Blinkit)"),
      { target: { value: "Amazon" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/categories/master", {
        parent_category: "Shopping",
        sub_category: "Amazon",
      });
    });
  });

  it("clears the form inputs after a successful add", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    const parentInput = screen.getByPlaceholderText(
      "Parent category (e.g. Food & Dining)",
    );
    const subInput = screen.getByPlaceholderText("Sub-category (e.g. Blinkit)");

    fireEvent.change(parentInput, { target: { value: "Shopping" } });
    fireEvent.change(subInput, { target: { value: "Amazon" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect((parentInput as HTMLInputElement).value).toBe("");
      expect((subInput as HTMLInputElement).value).toBe("");
    });
  });

  it("shows API error message when POST returns a 409 conflict", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: {
        data: { detail: "Entry 'Food & Dining / Swiggy' already exists." },
      },
    });

    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Parent category (e.g. Food & Dining)"),
      { target: { value: "Food & Dining" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sub-category (e.g. Blinkit)"),
      { target: { value: "Swiggy" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        screen.getByText("Entry 'Food & Dining / Swiggy' already exists."),
      ).toBeInTheDocument();
    });
  });

  it("shows fallback error message when POST fails without response.data.detail", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network Error"));

    renderCategories();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Parent category (e.g. Food & Dining)"),
      { target: { value: "Food & Dining" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Sub-category (e.g. Blinkit)"),
      { target: { value: "Blinkit" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to add entry.")).toBeInTheDocument();
    });
  });
});

// ── Tests: Delete sub-category ────────────────────────────────────────────────

describe("Categories page — Delete sub-category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("calls DELETE /categories/master/{id} when × is clicked", async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderCategories();
    await waitFor(() =>
      expect(screen.getAllByTitle("Remove")).toHaveLength(3),
    );

    // Click the first × button (Swiggy — id = cm-1)
    const removeButtons = screen.getAllByTitle("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/categories/master/cm-1");
    });
  });

  it("reloads master data after a successful delete", async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderCategories();
    await waitFor(() =>
      expect(screen.getAllByTitle("Remove")).toHaveLength(3),
    );

    const removeButtons = screen.getAllByTitle("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      // GET /categories/master called once on mount + once after delete = 2
      const masterCalls = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]) => url === "/categories/master",
      );
      expect(masterCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── Tests: Description Mappings table ────────────────────────────────────────

describe("Categories page — Description Mappings table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("shows the entry count in the section heading", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("(2 entries)")).toBeInTheDocument();
    });
  });

  it("renders transaction description text in the table", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("SWIGGY ORDER")).toBeInTheDocument();
      expect(screen.getByText("UBER TRIP")).toBeInTheDocument();
    });
  });

  it("renders column headers: Description, Category, Sub-category, Payment Method, Last Updated", async () => {
    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Category")).toBeInTheDocument();
      expect(screen.getByText("Sub-category")).toBeInTheDocument();
      expect(screen.getByText("Payment Method")).toBeInTheDocument();
      expect(screen.getByText("Last Updated")).toBeInTheDocument();
    });
  });

  it("shows empty-state message when there are no description mappings", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/categories/master") return Promise.resolve({ data: {} });
      if (url === "/categories/descriptions")
        return Promise.resolve({ data: [] });
      if (url === "/categories/payment-methods")
        return Promise.resolve({ data: PAYMENT_METHODS });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });

    renderCategories();
    await waitFor(() => {
      expect(screen.getByText(/No mappings yet/i)).toBeInTheDocument();
    });
  });

  it("shows 'AI' for rows with no updated_at date", async () => {
    renderCategories();
    await waitFor(() => {
      // UBER TRIP has updated_at = null so "AI" should appear
      expect(screen.getByText("AI")).toBeInTheDocument();
    });
  });

  it("shows a formatted date for rows with an updated_at value", async () => {
    renderCategories();
    await waitFor(() => {
      // 2024-01-15 should render as a localeDateString — just check it's not "AI"
      const dateCells = screen
        .getAllByRole("cell")
        .filter((cell) => cell.textContent && cell.textContent !== "AI");
      expect(dateCells.length).toBeGreaterThan(0);
    });
  });
});

// ── Tests: Auto-Categorize button ─────────────────────────────────────────────

describe("Categories page — Auto-Categorize button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("renders the Auto-Categorize button", async () => {
    renderCategories();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows success message after successful analyze call", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { message: "Categorization complete", mapped: 5 },
    });

    renderCategories();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Auto-Categorize/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Categorization complete — 5 descriptions mapped."),
      ).toBeInTheDocument();
    });
  });

  it("calls POST /categories/analyze when button is clicked", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { message: "Categorization complete", mapped: 3 },
    });

    renderCategories();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Auto-Categorize/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/categories/analyze");
    });
  });

  it("shows failure message when analyze call fails", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server Error"),
    );

    renderCategories();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Auto-Categorize/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Categorization failed. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("disables the button while analysis is in progress", async () => {
    // Never resolves so we can test the loading state
    (api.post as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );

    renderCategories();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Auto-Categorize/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Analyzing/i })).toBeDisabled();
    });
  });

  it("reloads descriptions after successful analyze", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { message: "Categorization complete", mapped: 2 },
    });

    renderCategories();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Auto-Categorize/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Auto-Categorize/i }));

    await waitFor(() => {
      const descCalls = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]) => url === "/categories/descriptions",
      );
      // Initial load + reload after analyze = at least 2
      expect(descCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── Tests: Description mapping dropdowns ──────────────────────────────────────

describe("Categories page — mapping dropdowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("calls PATCH /categories/descriptions/{id} when payment method changes", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("SWIGGY ORDER")).toBeInTheDocument();
    });

    // Use querySelectorAll to get actual <select> elements (avoids datalist inputs)
    // Order per row: parent, sub, payment — so index 2 = payment for first row
    const selects = document.querySelectorAll("select");
    const paymentSelect = selects[2] as HTMLSelectElement;

    fireEvent.change(paymentSelect, { target: { value: "NEFT" } });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/categories/descriptions/dc-1",
        expect.objectContaining({ payment_method: "NEFT" }),
      );
    });
  });

  it("calls PATCH when parent category changes and resets sub_category to null", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("SWIGGY ORDER")).toBeInTheDocument();
    });

    // Index 0 = parent select for first row
    const selects = document.querySelectorAll("select");
    const parentSelect = selects[0] as HTMLSelectElement;

    fireEvent.change(parentSelect, { target: { value: "Transport" } });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/categories/descriptions/dc-1",
        expect.objectContaining({
          parent_category: "Transport",
          sub_category: null,
        }),
      );
    });
  });

  it("sub-category dropdown is disabled when parent_category is null", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/categories/master") return Promise.resolve({ data: MASTER_DATA });
      if (url === "/categories/descriptions")
        return Promise.resolve({
          data: [
            {
              id: "dc-no-parent",
              description: "UNKNOWN TXN",
              parent_category: null,
              sub_category: null,
              payment_method: null,
              updated_at: null,
              updated_by: null,
            },
          ],
        });
      if (url === "/categories/payment-methods")
        return Promise.resolve({ data: PAYMENT_METHODS });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });

    renderCategories();
    await waitFor(() => {
      expect(screen.getByText("UNKNOWN TXN")).toBeInTheDocument();
    });

    // Index 1 = sub-category select (parent=0, sub=1, payment=2)
    const selects = document.querySelectorAll("select");
    const subSelect = selects[1] as HTMLSelectElement;
    expect(subSelect).toBeDisabled();
  });
});

// ── Tests: CategoryBadge colours ──────────────────────────────────────────────

describe("Categories page — CategoryBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllGetCalls();
  });

  it("renders a badge with known Tailwind colour classes for 'Food & Dining'", async () => {
    renderCategories();
    await waitFor(() => {
      const badge = screen
        .getAllByText("Food & Dining")
        .find((el) => el.className.includes("rounded-full"));
      expect(badge).toBeTruthy();
      expect(badge!.className).toContain("bg-green-100");
      expect(badge!.className).toContain("text-green-800");
    });
  });

  it("renders a badge with known Tailwind colour classes for 'Transport'", async () => {
    renderCategories();
    await waitFor(() => {
      const badge = screen
        .getAllByText("Transport")
        .find((el) => el.className.includes("rounded-full"));
      expect(badge).toBeTruthy();
      expect(badge!.className).toContain("bg-blue-100");
      expect(badge!.className).toContain("text-blue-800");
    });
  });
});
