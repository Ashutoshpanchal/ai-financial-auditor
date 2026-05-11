/**
 * Tests for frontend/src/pages/Dashboard.tsx (Phase 9 split-panel redesign)
 *
 * Covers:
 *  - Loading skeleton shown while fetching widgets/layout
 *  - Widget grid renders after data loads
 *  - Edit mode button opens EditModePanel
 *  - Left and right panels can be collapsed / expanded
 *  - Chat panel renders
 *  - FilterBar renders
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../components/dashboard/WidgetGrid", () => ({
  WidgetGrid: () => <div data-testid="widget-grid">WidgetGrid</div>,
}));
vi.mock("../components/dashboard/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));
vi.mock("../components/dashboard/EditModePanel", () => ({
  EditModePanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="edit-mode-panel">
      <button onClick={onClose}>Done</button>
    </div>
  ),
}));
vi.mock("../components/dashboard/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel">ChatPanel</div>,
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────
import Dashboard from "./Dashboard";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WIDGETS = [
  { id: "w1", title: "Total Credits", widget_type: "metric", query_config: {}, is_default: true },
];
const LAYOUT = { cols: 3, grid: [{ widget_id: "w1", row: 0, col: 0, col_span: 1 }] };
const SESSIONS = [{ id: "sess-1", title: "Dashboard Chat" }];

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
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Dashboard (Phase 9 split-panel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons while fetching", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderDashboard();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders widget grid, filter bar, and chat panel after data loads", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();

    await waitFor(() => expect(screen.getByTestId("widget-grid")).toBeInTheDocument());
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("shows Dashboard and Finance Assistant headings", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();
    await waitFor(() => screen.getByText("Dashboard"));
    expect(screen.getByText("Finance Assistant")).toBeInTheDocument();
  });

  it("clicking '+ Add Widgets' opens EditModePanel", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();
    await waitFor(() => screen.getByText("+ Add Widgets"));
    fireEvent.click(screen.getByText("+ Add Widgets"));
    expect(screen.getByTestId("edit-mode-panel")).toBeInTheDocument();
  });

  it("Done button in EditModePanel closes it", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();
    await waitFor(() => screen.getByText("+ Add Widgets"));
    fireEvent.click(screen.getByText("+ Add Widgets"));
    fireEvent.click(screen.getByText("Done"));
    expect(screen.queryByTestId("edit-mode-panel")).not.toBeInTheDocument();
  });

  it("collapse button hides left panel, expander re-shows it", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();
    await waitFor(() => screen.getByTitle("Collapse dashboard"));
    fireEvent.click(screen.getByTitle("Collapse dashboard"));
    expect(screen.queryByTestId("widget-grid")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Expand dashboard"));
    await waitFor(() => expect(screen.getByTestId("widget-grid")).toBeInTheDocument());
  });

  it("collapse button hides right chat panel, expander re-shows it", async () => {
    vi.stubGlobal("fetch", makeFetch({
      "/dashboard/widgets": WIDGETS,
      "/dashboard/layout": LAYOUT,
      "/chat/sessions": SESSIONS,
    }));

    renderDashboard();
    await waitFor(() => screen.getByTitle("Collapse chat"));
    fireEvent.click(screen.getByTitle("Collapse chat"));
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Expand chat"));
    await waitFor(() => expect(screen.getByTestId("chat-panel")).toBeInTheDocument());
  });
});
