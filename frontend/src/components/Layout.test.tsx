/**
 * Tests for frontend/src/components/Layout.tsx
 *
 * Layout is the shared shell rendered around every protected route.
 * It contains the sticky Navbar with NavLink active-state highlighting,
 * user avatar + name, logout button, and an <Outlet /> for child routes.
 *
 * Mocking strategy:
 *  - useAuth hook  : vi.mock() so we control user / logout without a real AuthProvider
 *  - react-router-dom : real MemoryRouter + Routes so NavLink isActive works correctly
 *  - Outlet content   : a simple <div data-testid="outlet-child"> sentinel element
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockLogout = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../hooks/useAuth";

// ── Helper ─────────────────────────────────────────────────────────────────────

/**
 * Render Layout inside a real MemoryRouter so NavLink isActive state works.
 * The `initialPath` controls which route is considered active.
 */
function renderLayout(
  userOverride: {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
    role?: "user" | "admin" | "super_admin";
  } = {},
  initialPath = "/dashboard"
) {
  const user = {
    id: "u1",
    email: "test@example.com",
    name: "Test User",
    picture: undefined,
    role: "user" as const,
    ...userOverride,
  };

  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user,
    loading: false,
    logout: mockLogout,
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/dashboard"
            element={<div data-testid="outlet-child">Dashboard page</div>}
          />
          <Route
            path="/upload"
            element={<div data-testid="outlet-child">Upload page</div>}
          />
          <Route
            path="/categories"
            element={<div data-testid="outlet-child">Categories page</div>}
          />
          <Route
            path="/widget-studio"
            element={<div data-testid="outlet-child">Widget Studio page</div>}
          />
          <Route
            path="/chat"
            element={<div data-testid="outlet-child">Chat page</div>}
          />
          <Route
            path="/admin"
            element={<div data-testid="outlet-child">Admin page</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests: Brand ───────────────────────────────────────────────────────────────

describe("Layout — brand", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the FinanceAI brand name", () => {
    renderLayout();
    expect(screen.getByText("FinanceAI")).toBeInTheDocument();
  });
});

// ── Tests: Nav links ───────────────────────────────────────────────────────────

describe("Layout — navigation links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Dashboard nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renders the Upload nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Upload" })).toBeInTheDocument();
  });

  it("renders the Categories nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Categories" })).toBeInTheDocument();
  });

  it("renders the Widget Studio nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Widget Studio" })).toBeInTheDocument();
  });

  it("does NOT render the Admin link for a regular user", () => {
    renderLayout({ role: "user" });
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("renders the Admin link for an admin user", () => {
    renderLayout({ role: "admin" });
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("renders the Admin link for a super_admin user", () => {
    renderLayout({ role: "super_admin" });
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });
});

// ── Tests: Active-state highlighting ──────────────────────────────────────────

describe("Layout — NavLink active-state highlighting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies active classes to the Dashboard link when path is /dashboard", () => {
    renderLayout({}, "/dashboard");
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link.className).toContain("bg-indigo-50");
    expect(link.className).toContain("text-indigo-600");
    expect(link.className).toContain("font-semibold");
  });

  it("does NOT apply active classes to Upload link when path is /dashboard", () => {
    renderLayout({}, "/dashboard");
    const link = screen.getByRole("link", { name: "Upload" });
    expect(link.className).not.toContain("font-semibold");
  });

  it("applies active classes to the Upload link when path is /upload", () => {
    renderLayout({}, "/upload");
    const link = screen.getByRole("link", { name: "Upload" });
    expect(link.className).toContain("bg-indigo-50");
    expect(link.className).toContain("text-indigo-600");
    expect(link.className).toContain("font-semibold");
  });

  it("applies active classes to the Categories link when path is /categories", () => {
    renderLayout({}, "/categories");
    const link = screen.getByRole("link", { name: "Categories" });
    expect(link.className).toContain("bg-indigo-50");
    expect(link.className).toContain("text-indigo-600");
  });

  it("applies active classes to the Widget Studio link when path is /widget-studio", () => {
    renderLayout({}, "/widget-studio");
    const link = screen.getByRole("link", { name: "Widget Studio" });
    expect(link.className).toContain("bg-indigo-50");
    expect(link.className).toContain("text-indigo-600");
  });

  it("applies active classes to the Admin link when path is /admin (admin user)", () => {
    renderLayout({ role: "admin" }, "/admin");
    const link = screen.getByRole("link", { name: "Admin" });
    expect(link.className).toContain("bg-indigo-50");
    expect(link.className).toContain("text-indigo-600");
  });
});

// ── Tests: User avatar and name ────────────────────────────────────────────────

describe("Layout — user avatar and name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("displays the user name in the header", () => {
    renderLayout({ name: "Jane Doe" });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders user avatar img when picture is provided", () => {
    renderLayout({ name: "Jane Doe", picture: "https://example.com/pic.jpg" });
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/pic.jpg");
    expect(img).toHaveAttribute("alt", "Jane Doe");
  });

  it("does NOT render avatar img when picture is absent", () => {
    renderLayout({ picture: undefined });
    expect(screen.queryByRole("img")).toBeNull();
  });
});

// ── Tests: Logout button ───────────────────────────────────────────────────────

describe("Layout — logout button", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Logout button", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("calls logout() from useAuth when Logout is clicked", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

// ── Tests: Outlet rendering ────────────────────────────────────────────────────

describe("Layout — Outlet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders child route content via Outlet", () => {
    renderLayout({}, "/dashboard");
    expect(screen.getByTestId("outlet-child")).toBeInTheDocument();
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});
