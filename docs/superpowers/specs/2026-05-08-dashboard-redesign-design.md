# Dashboard Redesign — Design Spec
**Date:** 2026-05-08  
**Phase:** 9 — Combined Dashboard + Chat (UX Redesign)

---

## Overview

Replace the current flat Dashboard page with a **split-panel, widget-based, conversational BI dashboard**. Users own a single personalised dashboard with live widgets. The LangGraph chat agent runs inside the right panel and can suggest new widgets based on queries. Analyse is moved from Upload into the chat panel.

---

## What Does NOT Change

- `Upload.tsx` — untouched. File upload stays exactly as is.
- `AuditReport.tsx` — kept, linked from audit history.
- All existing backend routers except `documents.py` (minor addition) and `chat.py` (minor addition).

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Filter Bar: [Date From] [Date To] [Bank ▼] [Category ▼]│
├──────────────────────────────┬──────────────────────────┤
│                              │                          │
│   Dashboard Panel (left)     │   Chat Panel (right)     │
│                              │                          │
│   [Widget][Widget][Widget]   │   [Chat history]         │
│   [  Graph (wide)  ][Widget] │   [Analyze] [Send]       │
│                              │   [Widget suggestion ↓]  │
│   [Edit Dashboard]           │                          │
└──────────────────────────────┴──────────────────────────┘
```

- Both panels are **independently collapsible** (minimize button on each).
- When left panel is collapsed → chat takes full width.
- When right panel is collapsed → dashboard takes full width.

---

## Database Schema

### Table: `user_widgets`
One row per widget definition. Acts as the user's **widget library**.  
A widget can exist in the library without being placed on the dashboard.

```sql
CREATE TABLE user_widgets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    widget_type  VARCHAR(50)  NOT NULL,  -- 'metric' | 'bar_chart' | 'pie_chart' | 'line_chart'
    query_config JSONB        NOT NULL,  -- parameterized query definition (see below)
    is_default   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_widgets_user_id ON user_widgets(user_id);
```

RLS: users see only their own rows (`user_id = current_setting('app.current_user_id')::uuid`).

### Table: `user_dashboards`
One row per user. Stores **only the grid layout** — which widgets are placed and where.

```sql
CREATE TABLE user_dashboards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    layout     JSONB NOT NULL DEFAULT '{"cols": 3, "grid": []}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: users see only their own row.

### Layout JSON shape
```json
{
  "cols": 3,
  "grid": [
    { "widget_id": "uuid-1", "row": 0, "col": 0, "col_span": 1 },
    { "widget_id": "uuid-2", "row": 0, "col": 1, "col_span": 1 },
    { "widget_id": "uuid-3", "row": 0, "col": 2, "col_span": 1 },
    { "widget_id": "uuid-4", "row": 1, "col": 0, "col_span": 2 },
    { "widget_id": "uuid-5", "row": 1, "col": 2, "col_span": 1 }
  ]
}
```

---

## Query Config Shapes

All widgets use a parameterized `query_config` JSONB. A **query generator service** (no LLM) translates this into a SQLAlchemy query against the `transactions` table.

### Metric card
```json
{
  "aggregation": "sum",
  "field": "credit",
  "filters": {
    "category": null,
    "bank_name": null,
    "transaction_type": "credit"
  },
  "format": "currency"
}
```

### Bar chart
```json
{
  "aggregation": "sum",
  "field": "debit",
  "group_by": "month",
  "filters": {
    "category": null,
    "bank_name": null,
    "transaction_type": null
  }
}
```

### Pie chart
```json
{
  "aggregation": "sum",
  "field": "debit",
  "group_by": "category",
  "filters": {
    "transaction_type": "debit"
  }
}
```

**Supported values:**
- `aggregation`: `sum | count | avg | max | min`
- `field`: `credit | debit`
- `group_by` (charts only): `month | category | bank_name`
- `filters.transaction_type`: `"credit" | "debit" | null`
- `format` (metric only): `"currency" | "number"`

**Global filter bar** (date_from, date_to, bank_name, category) applies as additional WHERE clauses on top of every widget's own config filters at query time.

---

## Default Dashboard Config

Defined in `backend/config/default_dashboard.py` (Python constants, not DB).

**Default widgets (4):**
| # | Title | Type | Query |
|---|---|---|---|
| 1 | Total Credits | metric | `sum(credit)`, format=currency |
| 2 | Total Debits | metric | `sum(debit)`, format=currency |
| 3 | Monthly Spend | bar_chart | `sum(debit)` group by month |
| 4 | Spend by Category | pie_chart | `sum(debit)` group by category |

**Default layout:**
```
[Total Credits][Total Debits][          ]
[  Monthly Spend (wide)     ][Spend/Cat ]
```

---

## Default Dashboard Bootstrap

**Trigger:** Inside `upload_document()` background task in `routers/documents.py`, after document status transitions to `"completed"`.

**Guard:** Check `SELECT COUNT(*) FROM user_widgets WHERE user_id = ? AND is_default = TRUE`. If > 0, skip (dashboard already bootstrapped).

**Steps (in `dashboard_service.bootstrap_default_dashboard`):**
1. Read `DEFAULT_WIDGETS` from config
2. Bulk-insert into `user_widgets` with `is_default=True`, capture generated UUIDs
3. Build layout JSON using UUID order
4. Insert one row into `user_dashboards`

All in one DB transaction — either fully succeeds or rolls back.

---

## Widget Lifecycle

```
LLM suggests widget
        │
        ▼
  user_widgets (library) ← also created manually via "Add Widget" in edit mode
        │
        │  user drags widget onto grid in edit mode
        ▼
  user_dashboards.layout (grid) ← user_id + position + col_span
        │
        │  user removes widget from dashboard
        ▼
  widget_id removed from layout JSON (widget stays in library)
        │
        │  user deletes widget from library
        ▼
  row deleted from user_widgets + removed from layout JSON
```

**LLM never writes to `user_dashboards`.** Only the user does, via edit mode.

---

## LLM Widget Suggestion Protocol

After `analysis_node` in LangGraph produces its response, an additional check runs:  
If the response contains a quantifiable insight (a number tied to a category, time period, or field), the agent appends a `widget_suggestion` to the API response.

**`send_message` response shape (addition):**
```json
{
  "reply": "You spent ₹8,400 on subscriptions last quarter.",
  "session_id": "uuid",
  "widget_suggestion": {
    "title": "Subscription Spend",
    "widget_type": "metric",
    "query_config": {
      "aggregation": "sum",
      "field": "debit",
      "filters": { "category": "Subscriptions" },
      "format": "currency"
    }
  }
}
```

`widget_suggestion` is `null` when no widget is appropriate.

**Frontend behaviour:**  
When `widget_suggestion` is non-null, render an inline card below the chat message:
> 📊 **Subscription Spend** — Add this widget to your library? [Add to Library]

Clicking "Add to Library" → `POST /dashboard/widgets` → widget appears in library with a notification badge. User places it on the dashboard manually during edit mode.

---

## API Endpoints — `backend/routers/dashboard.py`

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard/widgets` | List all widgets in user's library |
| `POST` | `/dashboard/widgets` | Create a widget (manual or from LLM suggestion) |
| `PATCH` | `/dashboard/widgets/{id}` | Update widget title or query_config |
| `DELETE` | `/dashboard/widgets/{id}` | Delete from library + remove from layout |
| `GET` | `/dashboard/widgets/{id}/data` | Run live query, return value/series. Accepts `?date_from&date_to&bank_name&category` |
| `GET` | `/dashboard/layout` | Get user's dashboard layout JSON |
| `PUT` | `/dashboard/layout` | Save updated layout (called when user exits edit mode) |

---

## Frontend Components

```
frontend/src/
  pages/
    Dashboard.tsx              ← full redesign (split panel, filter bar, state)
  components/
    dashboard/
      FilterBar.tsx            ← date range + bank + category dropdowns
      WidgetGrid.tsx           ← renders layout, handles edit mode toggle
      EditModePanel.tsx        ← widget library drawer, add widget form
      MetricCard.tsx           ← live metric widget
      BarChartWidget.tsx       ← live bar chart widget
      PieChartWidget.tsx       ← live pie chart widget
      ChatPanel.tsx            ← chat history + input + Analyze button
      WidgetSuggestionCard.tsx ← inline "Add to Library" card in chat
```

**Drag-and-drop library:** `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, no jQuery).

---

## Files Removed / Retired

| File | Fate |
|---|---|
| `frontend/src/pages/Chat.tsx` | Removed — chat lives in `ChatPanel.tsx` inside Dashboard |
| Analyze button in `Upload.tsx` | Already removed (Upload stays as upload-only) |

---

## Testing Requirements

**Backend:**
- `backend/tests/test_dashboard_router.py` — CRUD widget, layout save, live data endpoint
- `backend/tests/test_widget_query.py` — query generator for all widget types + filter combinations
- `backend/tests/test_dashboard_service.py` — bootstrap logic (first upload, idempotency)

**Frontend:**
- `frontend/src/components/dashboard/*.test.tsx` — MetricCard, BarChartWidget, PieChartWidget, ChatPanel, FilterBar
- `frontend/src/pages/Dashboard.test.tsx` — panel collapse, edit mode toggle, layout save
