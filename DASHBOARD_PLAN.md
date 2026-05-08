# Dashboard Redesign — Implementation Plan
**Phase 9 | Design spec:** `docs/superpowers/specs/2026-05-08-dashboard-redesign-design.md`  
**Status:** 🔴 Not started

> Resume: read CLAUDE.md → design spec above → this file → pick up the next ☐ item.

---

## Overview of Changes

| Area | Change |
|---|---|
| `Upload.tsx` | **No change** |
| `Dashboard.tsx` | Full redesign — split panel, widget grid, edit mode |
| `Chat.tsx` | **Removed** — chat moves into `ChatPanel.tsx` inside Dashboard |
| New frontend components | FilterBar, WidgetGrid, EditModePanel, MetricCard, BarChartWidget, PieChartWidget, ChatPanel, WidgetSuggestionCard |
| New backend files | migration, 2 ORM models, default config, query generator service, dashboard service, dashboard router |
| Modified backend files | `documents.py` (bootstrap hook), `agents/nodes.py` (widget suggestion), `routers/chat.py` (suggestion in response), `main.py` (register router) |

---

## Phase 9A — Backend: Database + Models

### Task 1 — Migration: `migrations/009_widgets.sql`
- [ ] Create `user_widgets` table
  - Columns: `id UUID PK`, `user_id UUID FK→users`, `title VARCHAR(255)`, `widget_type VARCHAR(50)`, `query_config JSONB`, `is_default BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ`
  - Index on `user_id`
- [ ] Create `user_dashboards` table
  - Columns: `id UUID PK`, `user_id UUID UNIQUE FK→users`, `layout JSONB DEFAULT '{"cols":3,"grid":[]}'`, `updated_at TIMESTAMPTZ`
- [ ] Apply RLS to `user_widgets`
  - Policy: `user_id = current_setting('app.current_user_id')::uuid`
- [ ] Apply RLS to `user_dashboards`
  - Policy: `user_id = current_setting('app.current_user_id')::uuid`

### Task 2 — ORM Model: `backend/models/widget.py`
- [ ] `UserWidget` SQLAlchemy model
  - Fields matching migration
  - `query_config` as `JSON` type
  - Docstring on class and all columns

### Task 3 — ORM Model: `backend/models/dashboard.py`
- [ ] `UserDashboard` SQLAlchemy model
  - Fields matching migration
  - `layout` as `JSON` type
  - Docstring on class and all columns

### Task 4 — Register models in `backend/main.py` / `backend/models/__init__.py`
- [ ] Import both new models so SQLAlchemy Base picks them up on startup

---

## Phase 9B — Backend: Config + Services

### Task 5 — Default Dashboard Config: `backend/config/default_dashboard.py`
- [ ] `DEFAULT_WIDGETS` list of 4 dicts:
  - Total Credits (metric, `sum credit`, format=currency)
  - Total Debits (metric, `sum debit`, format=currency)
  - Monthly Spend (bar_chart, `sum debit` group_by=month)
  - Spend by Category (pie_chart, `sum debit` group_by=category)
- [ ] `DEFAULT_LAYOUT` dict with `cols=3` and `grid` array using `widget_index` references

### Task 6 — Query Generator: `backend/services/widget_query.py`
- [ ] `resolve_widget_data(config, user_id, db, date_from, date_to, bank_name, category) -> dict | list`
  - Metric branch: build `SELECT aggregation(field) FROM transactions WHERE user_id=? [+ config.filters] [+ global filters]`
  - Bar chart branch: build `SELECT group_by_col, aggregation(field) FROM transactions GROUP BY group_by_col ORDER BY group_by_col`
  - Pie chart branch: build `SELECT group_by_col, aggregation(field) FROM transactions GROUP BY group_by_col ORDER BY aggregation DESC`
  - Apply global filters (date_from, date_to, bank_name, category) on top of config filters
  - Validate `aggregation`, `field`, `group_by` values against allowed enums — raise `ValueError` on unknown
  - All queries use SQLAlchemy ORM (no raw SQL strings)
  - Docstring on function

### Task 7 — Dashboard Service: `backend/services/dashboard_service.py`
- [ ] `is_dashboard_bootstrapped(user_id, db) -> bool`
  - Returns True if `user_widgets WHERE user_id=? AND is_default=TRUE` count > 0
- [ ] `bootstrap_default_dashboard(user_id, db) -> None`
  - Guard: call `is_dashboard_bootstrapped` first, return early if True
  - Read `DEFAULT_WIDGETS` from config
  - Bulk-insert `UserWidget` rows with `is_default=True`, capture UUIDs
  - Build layout JSON replacing `widget_index` with real UUIDs
  - Insert `UserDashboard` row
  - All in single DB transaction (rollback on any failure)
  - Docstring on function

---

## Phase 9C — Backend: Dashboard Router

### Task 8 — Router: `backend/routers/dashboard.py`
- [ ] `GET /dashboard/widgets` — list user's widget library (all rows for current user)
- [ ] `POST /dashboard/widgets` — create widget; body: `{title, widget_type, query_config}`; validates query_config shape
- [ ] `PATCH /dashboard/widgets/{id}` — update `title` and/or `query_config`; 404 if not found or not owned
- [ ] `DELETE /dashboard/widgets/{id}` — delete widget from library AND remove its entry from `user_dashboards.layout` JSON
- [ ] `GET /dashboard/widgets/{id}/data` — call `resolve_widget_data`; query params: `date_from`, `date_to`, `bank_name`, `category`
- [ ] `GET /dashboard/layout` — return user's `UserDashboard.layout`; if no dashboard row exists return `{"cols":3,"grid":[]}`
- [ ] `PUT /dashboard/layout` — replace `user_dashboards.layout` for current user; upsert if row doesn't exist
- [ ] All endpoints: `set_rls_user()`, `get_current_user()`, explicit exception handling, docstrings

### Task 9 — Register router in `backend/main.py`
- [ ] `app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])`

---

## Phase 9D — Backend: Agent + Document Enhancements

### Task 10 — Bootstrap hook in `backend/routers/documents.py`
- [ ] After document audit completes successfully in background task, call `bootstrap_default_dashboard(user_id, db)`
- [ ] Wrap in try/except — bootstrap failure must NOT fail the document pipeline

### Task 11 — Widget suggestion in `backend/agents/nodes.py`
- [ ] Add `suggest_widget_node(state: AgentState) -> AgentState`
  - Reads `state["analysis_result"]` (or last assistant message)
  - Uses a small prompt to check: does this response contain a quantifiable insight that maps to a known widget type?
  - If yes: build `widget_suggestion` dict (`title`, `widget_type`, `query_config`)
  - Stores in `state["widget_suggestion"]`
  - If no clear insight: `state["widget_suggestion"] = None`
- [ ] Wire `suggest_widget_node` after `analysis_node` in the LangGraph graph in `backend/agents/chat.py`

### Task 12 — Expose `widget_suggestion` in `backend/routers/chat.py`
- [ ] Add `widget_suggestion: dict | None` field to `SendMessageResponse` model
- [ ] Pass `state["widget_suggestion"]` from graph result into response

---

## Phase 9E — Frontend: Core Layout

### Task 13 — Install drag-and-drop dependency
- [ ] `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in `frontend/`

### Task 14 — `frontend/src/components/dashboard/FilterBar.tsx`
- [ ] Props: `onFilterChange(filters: FilterState) -> void`
- [ ] `FilterState`: `{ date_from: string|null, date_to: string|null, bank_name: string|null, category: string|null }`
- [ ] Date From / Date To inputs (type=date)
- [ ] Bank name dropdown (fetched from `GET /documents` unique bank_names)
- [ ] Category dropdown (fetched from `GET /categories/master`)
- [ ] Apply button updates parent state; Reset clears all

### Task 15 — `frontend/src/components/dashboard/MetricCard.tsx`
- [ ] Props: `widgetId`, `title`, `filters: FilterState`, `editMode: boolean`
- [ ] Fetches `GET /dashboard/widgets/{widgetId}/data?...filters` on mount and on filter change
- [ ] Renders title + formatted value (currency or number)
- [ ] Loading skeleton while fetching
- [ ] Error state if fetch fails
- [ ] Delete button visible in edit mode

### Task 16 — `frontend/src/components/dashboard/BarChartWidget.tsx`
- [ ] Props: `widgetId`, `title`, `filters: FilterState`, `editMode: boolean`
- [ ] Fetches live data on mount + filter change
- [ ] Renders Recharts `BarChart` (reuse existing chart setup from Dashboard.tsx)
- [ ] Loading skeleton, error state
- [ ] Delete button in edit mode

### Task 17 — `frontend/src/components/dashboard/PieChartWidget.tsx`
- [ ] Props: `widgetId`, `title`, `filters: FilterState`, `editMode: boolean`
- [ ] Fetches live data on mount + filter change
- [ ] Renders Recharts `PieChart` (reuse existing)
- [ ] Loading skeleton, error state
- [ ] Delete button in edit mode

### Task 18 — `frontend/src/components/dashboard/WidgetGrid.tsx`
- [ ] Props: `layout`, `filters`, `editMode`, `onLayoutChange`, `onDeleteWidget`
- [ ] Renders widgets from layout grid array, resolves widget type → correct component
- [ ] Edit mode: wraps with `@dnd-kit` drag-and-drop sortable
- [ ] Drag end → calls `onLayoutChange` with reordered grid
- [ ] `col_span` drives CSS grid column span (1, 2, or 3 of a 3-column grid)

### Task 19 — `frontend/src/components/dashboard/EditModePanel.tsx`
- [ ] Fetches `GET /dashboard/widgets` to show full library
- [ ] Shows widgets NOT currently in layout (available to add)
- [ ] "Add Widget" form: title + widget_type select + query_config builder (dropdowns for aggregation, field, group_by, filters)
- [ ] Submit → `POST /dashboard/widgets` → widget added to library list
- [ ] Click to add to grid → appends to end of layout grid
- [ ] "Save Dashboard" button → `PUT /dashboard/layout` with current grid state
- [ ] "Cancel" discards changes

### Task 20 — `frontend/src/components/dashboard/WidgetSuggestionCard.tsx`
- [ ] Props: `suggestion: WidgetSuggestion | null`, `onAdd: (suggestion) -> void`
- [ ] Renders inline below chat message when `suggestion` is non-null
- [ ] "Add to Library" button → calls `POST /dashboard/widgets` → calls `onAdd`
- [ ] Shows success state after adding ("Added to your widget library ✓")

### Task 21 — `frontend/src/components/dashboard/ChatPanel.tsx`
- [ ] Chat session management (create session on mount if none exists)
- [ ] Fetch session history `GET /chat/sessions/{id}`
- [ ] Message list with user/assistant bubbles
- [ ] `WidgetSuggestionCard` below assistant messages when suggestion present
- [ ] Input + Send button → `POST /chat/sessions/{id}/messages`
- [ ] **Analyze button** → calls `POST /audit/{documentId}` for the user's most recent completed document → shows progress in chat
- [ ] Document selector dropdown (if user has multiple completed documents)
- [ ] Loading state while agent responds

### Task 22 — `frontend/src/pages/Dashboard.tsx` — Full Redesign
- [ ] State: `filters`, `editMode`, `layout`, `leftCollapsed`, `rightCollapsed`
- [ ] Fetch `GET /dashboard/layout` on mount
- [ ] Render `FilterBar` at top (full width, always visible)
- [ ] Split panel: left = `WidgetGrid` + edit mode toggle, right = `ChatPanel`
- [ ] Left panel collapse button (chevron) — when collapsed, panel width = 0
- [ ] Right panel collapse button (chevron) — when collapsed, panel width = 0
- [ ] Edit mode toggle button on left panel header
- [ ] When `editMode=true`: render `EditModePanel` as slide-in drawer
- [ ] `onLayoutChange` → updates local state; `EditModePanel` save → persists to backend
- [ ] Widget library notification badge: fetch `GET /dashboard/widgets`, count those not in layout, show badge if > 0

---

## Phase 9F — Cleanup + Routing

### Task 23 — Update `frontend/src/App.tsx`
- [ ] Remove `/chat` route (or keep as redirect to `/dashboard`)
- [ ] Ensure `/dashboard` route is the main authenticated landing page

### Task 24 — Update `frontend/src/components/Layout.tsx`
- [ ] Remove "Chat" nav item (or convert to "Dashboard" if not already)
- [ ] Add widget library badge to Dashboard nav item

### Task 25 — Remove `frontend/src/pages/Chat.tsx`
- [ ] Delete file (chat is now inside Dashboard)
- [ ] Remove any imports

---

## Phase 9G — Tests

### Task 26 — `backend/tests/test_widget_query.py`
- [ ] `test_metric_sum_credit` — returns correct sum
- [ ] `test_metric_with_category_filter` — filters by category
- [ ] `test_bar_chart_group_by_month` — returns list of {month, value}
- [ ] `test_pie_chart_group_by_category` — returns list of {category, value}
- [ ] `test_global_date_filter_applied` — date_from/date_to narrows results
- [ ] `test_invalid_aggregation_raises` — ValueError on unknown aggregation
- [ ] `test_global_bank_filter_applied` — bank_name filter works

### Task 27 — `backend/tests/test_dashboard_service.py`
- [ ] `test_bootstrap_creates_widgets_and_layout` — 4 widgets + 1 dashboard row
- [ ] `test_bootstrap_idempotent` — called twice, still only 4 default widgets
- [ ] `test_is_bootstrapped_false_for_new_user`
- [ ] `test_is_bootstrapped_true_after_bootstrap`

### Task 28 — `backend/tests/test_dashboard_router.py`
- [ ] `test_list_widgets_empty` — returns [] for new user
- [ ] `test_create_widget` — 201, widget in library
- [ ] `test_create_widget_invalid_config` — 422 on bad query_config
- [ ] `test_delete_widget_removes_from_layout` — widget_id gone from layout.grid
- [ ] `test_get_widget_data_metric` — returns `{"value": ...}`
- [ ] `test_get_widget_data_bar` — returns `[{"label": ..., "value": ...}]`
- [ ] `test_get_layout_default_when_none` — returns empty grid
- [ ] `test_put_layout_saves` — layout persisted, returned on next GET
- [ ] `test_cannot_access_other_user_widget` — 404 (RLS)

### Task 29 — Frontend component tests
- [ ] `MetricCard.test.tsx` — renders value, loading state, error state
- [ ] `FilterBar.test.tsx` — apply triggers onFilterChange with correct values, reset clears
- [ ] `WidgetSuggestionCard.test.tsx` — renders when suggestion present, hidden when null, Add button calls onAdd
- [ ] `ChatPanel.test.tsx` — renders messages, Analyze button present, send message flow
- [ ] `Dashboard.test.tsx` — panel collapse toggles, edit mode toggle, layout fetch on mount

---

## Dependency Order

```
Task 1 (migration)
  → Task 2, 3 (models)
    → Task 4 (register)
      → Task 5 (config)
        → Task 6 (query generator)
        → Task 7 (dashboard service)
          → Task 8 (dashboard router)
            → Task 9 (register router)
            → Task 10 (bootstrap hook in documents)
  Task 11 → Task 12 (agent + chat response)
  Tasks 13-22 (frontend — can start after Task 8 is done)
    → Task 23, 24, 25 (cleanup)
  Tasks 26-29 (tests — written alongside each task)
```

---

## Last Updated: 2026-05-08
