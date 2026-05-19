/**
 * Tests for Widget Studio page — library, super-admin debug, new API wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WidgetStudio from "./WidgetStudio";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useTransactionDateScope", () => ({
  useTransactionDateScope: vi.fn(() => ({
    scope: { min: "2024-01-01", max: "2024-12-31" },
    defaultRange: { from: "2024-01-01", to: "2024-12-31" },
    loading: false,
    bankNames: ["HDFC"],
  })),
}));

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

function mockAuth(role: "user" | "super_admin" = "user") {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: "u1", email: "t@example.com", name: "Test", role },
    loading: false,
    logout: vi.fn(),
  });
}

function setupApi() {
  mockGet.mockImplementation((url: string) => {
    if (url === "/widget-studio/sessions") {
      return Promise.resolve({
        data: [
          {
            id: "sess-1",
            title: "Chat",
            created_at: "2026-01-01T00:00:00Z",
            widget_id: null,
            message_count: 0,
          },
        ],
      });
    }
    if (url === "/widget-studio/widgets") {
      return Promise.resolve({
        data: [
          {
            id: "w1",
            name: "Food spend",
            type: "metric",
            created_at: "2026-01-01T00:00:00Z",
            broken: false,
          },
        ],
      });
    }
    if (url.includes("/messages")) {
      return Promise.resolve({ data: [] });
    }
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
}

describe("WidgetStudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth("user");
    setupApi();
    mockPost.mockResolvedValue({ data: { id: "sess-new" } });
  });

  it("renders library count from widget-studio API", async () => {
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/1 saved/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Food spend")).toBeInTheDocument();
  });

  it("shows super admin debug panel for super_admin", async () => {
    mockAuth("super_admin");
    render(
      <MemoryRouter>
        <WidgetStudio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Super admin debug/i)).toBeInTheDocument();
    });
  });
});
