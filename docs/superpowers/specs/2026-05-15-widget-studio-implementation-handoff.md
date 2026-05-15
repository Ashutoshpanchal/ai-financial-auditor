# Widget Studio — implementation handoff

**Status:** Implementation was blocked because the workspace is in **Plan mode**, which only allows editing markdown/canvas files. To have the assistant apply patches automatically, **turn off Plan mode** or **approve Agent mode**, then ask: “apply the Widget Studio implementation.”

This document is the concrete build checklist and file-level spec so you (or the agent in Agent mode) can implement without re-deriving design.

---

## 1. Database

**New file:** `migrations/013_chat_session_kind.sql`

```sql
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_kind
    ON chat_sessions (user_id, session_kind);
```

Run migrations against dev/test DB as you normally do.

---

## 2. Backend — `ChatSession` model

**File:** `backend/models/chat_session.py`

- Add `session_kind: Mapped[str]` with `server_default="general"`, `default="general"`.

---

## 3. Backend — Chat router

**File:** `backend/routers/chat.py`

- `CreateSessionRequest`: add `session_kind: Literal["general", "widget_studio"] = "general"`.
- `CreateSessionResponse`: add `session_kind: str`.
- `SessionSummary`: add `session_kind: str`.
- `SendMessageResponse`: add `widget_suggestion_version: int | None = None` — set to `1` when `widget_suggestion` is non-null, else `None`.
- `create_session`: pass `session_kind=body.session_kind` into `ChatSession(...)`.
- `list_sessions`: add query param `session_kind: str | None = None`; if set, `filter(ChatSession.session_kind == session_kind)`.

---

## 4. Backend — Config

**File:** `backend/config.py`

- `widget_preview_rate_limit_per_minute: int = 0` — `0` disables rate limiting (safe default for tests/dev).
- `widget_studio_enabled: bool = True` — reserved for future gating.

**File:** `.env.example` — document `WIDGET_PREVIEW_RATE_LIMIT_PER_MINUTE` and `WIDGET_STUDIO_ENABLED`.

---

## 5. Backend — Preview rate limit

**New file:** `backend/services/preview_rate_limit.py`

- In-process sliding window (60s) per `user_id` using `deque` + `time.monotonic()`.
- `check_widget_preview_rate_limit(user_id: str, max_per_minute: int) -> None` — raises a dedicated exception or returns a bool; router maps to **429** with clear `detail`.
- `reset_widget_preview_rate_limits()` — call from tests only to avoid cross-test pollution.

---

## 6. Backend — Dashboard preview

**File:** `backend/routers/dashboard.py`

- At start of `preview_widget`, if `get_settings().widget_preview_rate_limit_per_minute > 0`, call `check_widget_preview_rate_limit(current_user.id, ...)`.
- On limit exceeded: `HTTPException(429, detail="Too many preview requests; try again shortly.")`.

---

## 7. Frontend — draft helpers

**New file:** `frontend/src/utils/widgetDraft.ts`

- Types: `WidgetType`, `WidgetDraft` (`title`, `widget_type`, `query_config`, `col_span` 1|2|3).
- `defaultDraft()`, `mergeWidgetSuggestion(draft, suggestion)`, `validateDraftForPreview(draft): string | null` (mirror backend enums: aggregations, fields, group_by, metric vs chart, raw_metric_sql exclusivity).

**New file:** `frontend/src/utils/widgetDraft.test.ts` (Vitest).

---

## 8. Frontend — `ChatPanel`

**File:** `frontend/src/components/dashboard/ChatPanel.tsx`

- Use `api` from `../services/api` instead of hardcoded `http://localhost:8000`.
- Props: `hideAnalyze?: boolean` (default false); `onWidgetSuggestion?: (s: WidgetSuggestion) => void` — when set, on new suggestion **call it** and **do not** render `WidgetSuggestionCard` (Studio merges into draft).
- Parse `widget_suggestion_version` from response if needed for future.

---

## 9. Frontend — `WidgetStudio` page

**File:** `frontend/src/pages/WidgetStudio.tsx` (replace)

- If `import.meta.env.VITE_WIDGET_STUDIO_ENABLED === "false"`, show disabled message + link to Dashboard.
- Layout: `h-[calc(100vh-64px)]` split — **left:** `ChatPanel` with `hideAnalyze`, `onWidgetSuggestion`, no `onAddWidget` (pass noop or omit).
- On mount: `GET /chat/sessions?session_kind=widget_studio`; if empty, `POST /chat/sessions` with `{ title: "Widget Studio", session_kind: "widget_studio" }`; set `sessionId`.
- **Right:** `FilterBar` (reuse), live **preview** via debounced `POST /dashboard/widgets/preview` with `AbortController`, optional filter query fields matching `WidgetPreviewRequest`.
- **Inspector:** title, widget type, builder fields (aggregation, field, group_by, filters.transaction_type, format), `col_span`.
- **Advanced:** collapsible raw SQL for metrics only (existing behavior), mutually exclusive with builder per backend rules.
- **Save to library:** `POST /dashboard/widgets`.
- **Save and add to dashboard:** create widget, `GET /dashboard/layout`, append `GridItem` with `col_span` from draft, `PUT /dashboard/layout` (same shape as Dashboard).

---

## 10. Tests

- `backend/tests/test_preview_rate_limit.py` — unit tests + reset helper.
- `backend/tests/test_dashboard_router.py` — one test: patch `get_settings` limit to small N, call preview N+1 times, assert 429 on last (reset rate limiter between tests).
- `backend/tests/test_chat_session_schema.py` — Pydantic `CreateSessionRequest` accepts `session_kind`; optional router test with mocks.

---

## Order of work

1. Migration + model + chat router + SessionSummary list filter.  
2. Rate limit service + dashboard hook + config + tests.  
3. `widgetDraft.ts` + tests.  
4. `ChatPanel` props + `api` base URL fix.  
5. `WidgetStudio.tsx` full UI.  
6. Run `pytest` + `npm run test` (Vitest) for touched areas.

When Plan mode is off, ask the coding agent to “implement from `docs/superpowers/specs/2026-05-15-widget-studio-implementation-handoff.md`.”
