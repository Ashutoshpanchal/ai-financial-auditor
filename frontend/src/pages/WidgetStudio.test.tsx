/**
 * Tests for Widget Studio page — library count, super-admin debug, save actions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WidgetStudio from "./WidgetStudio";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

function mockAuth(role: "user" | "super_admin" = "user") {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: {
      id: "u1",
      email: "test@example.com",
      name: "Test",
      role,
    },
    loading: false,
    logout: vi.fn(),
  });
}

let role: "user" | "super_admin" = "user";

function setupApi() {
  mockGet.mockImplementation((url: string) => {
    if (url === "/chat/sessions") {
      return Promise.resolve({
        data: [
          {
            id: "sess-1",
            title: "Widget Studio",
            session_kind: "widget_studio",
            message_count: 0,
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      });
    }
    if (url === "/dashboard/widgets") {
      return Promise.resolve({
        data: [
          {
            id: "w1",
            title: "Food spend",
            widget_type: "metric",
            query_config: { aggregation: "sum", field: "debit" },
          },
        ],
      });
    }
    if (url === "/categories/master/split") {
      return Promise.resolve({ data: { global: {}, user: {} } });
    }
    if (url.startsWith("/chat/sessions/") && !url.endsWith("/message")) {
      return Promise.resolve({
        data: {
          id: "sess-1",
          title: "Widget Studio",
          messages: [],
          draft_state: { status: "ready" },
        },
      });
    }
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
}

describe("WidgetStudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = "user";
    mockAuth("user");
    setupApi();
    mockPost.mockImplementation((url: string) => {
      if (url === "/dashboard/widgets/preview") {
        return Promise.resolve({
          data: {
            data: { value: 100, format: "currency" },
            human_query: "SELECT sum(debit)\nFROM your_transactions",
            ...(role === "super_admin"
              ? {
                  debug_sql:
                    "SELECT sum(transactions.debit) FROM transactions WHERE transactions.user_id = 'u1'",
                }
              : {}),
          },
        });
      }
      return Promise.resolve({ data: { id: "new-id" } });
    });
  });

  it("shows library widget count in header", async () => {
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Library \(1\)/).length).toBeGreaterThan(0);
    });
  });

  it("shows super admin debug panel for super_admin", async () => {
    role = "super_admin";
    mockAuth("super_admin");
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(
      () => {
        expect(screen.getByText("Super admin debug")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("hides super admin debug panel for regular users", async () => {
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Library \(1\)/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Super admin debug")).not.toBeInTheDocument();
  });

  it("shows Save widget in chat when draft is ready", async () => {
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Widget ready")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Save widget" })).toBeInTheDocument();
  });

  it("shows Update widget when a library item is selected", async () => {
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Food spend")).toBeInTheDocument();
    });
    const foodButtons = screen.getAllByRole("button", { name: /Food spend/i });
    fireEvent.click(foodButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/Editing library widget: Food spend/)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "Update widget" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save as new" })).toBeInTheDocument();
  });
});
