# FinanceAI — Widget Studio: Detailed Build To-Do

> **Scope:** Multi-agent backend, chat interface, widget/graph creation, storage, security, super admin debug mode, and logging.
>
> **Progress:** Complete (2026-05-19) — AgentScope agents, broken widgets, API, UI, migrations 015–016.
>
> **Implementation notes:**
> - Widget Studio agents: **AgentScope** + OpenRouter (`backend/widget_studio/agentscope/`).
> - Dashboard chat / audit pipeline: unchanged (LangChain / LangGraph).
> - API prefix: `/widget-studio/*` (not `/api/widget-studio`).
> - `user_widgets` bridge via `POST /widget-studio/widgets/{id}/add-to-dashboard`.
> - Legacy `/chat` with `session_kind=widget_studio` unchanged (`backend/agents/widget_studio.py`).
> - Broken widgets: sticky `broken` on `widget_definitions`; dashboard validates `query_config` literals; recovery = delete + recreate only.

---

## Progress summary

| Section | Status |
|---------|--------|
| 1. Database schema | ☑ `migrations/015_widget_studio_tables.sql` |
| 2. Multi-agent backend | ☑ `backend/widget_studio/` |
| 3. API endpoints | ☑ `backend/routers/widget_studio.py` |
| 4. Security & guardrails | ☑ |
| 5. Frontend — Widget Studio UI | ☑ `WidgetStudio.tsx` + components |
| 6–8. Flow, templates, widget types | ☑ Reference |
| 9. Error handling pass | ☑ |
| 10. Logging requirements | ☑ |
| 11. Build order | ☑ |

---

## 1. Database Schema Changes

- [x] `migrations/016_widget_definitions_broken.sql` — `broken BOOLEAN` on `widget_definitions`
- [x] `widget_definitions`
- [x] `widget_chat_sessions`
- [x] `widget_chat_messages`
- [x] `widget_agent_logs`

---

## 2. Backend — Multi-Agent System

### 2.1 Install and configure AgentScope

- [x] `agentscope>=1.0` in `backend/requirements.txt`
- [x] `backend/widget_studio/agentscope/` + `agentscope_config.py`
- [x] Agent package at `backend/widget_studio/` (not repo-root `/agents/` — avoids clash with `backend/agents/`)

### 2.2 System prompt constants

- [x] `CLARIFICATION_AGENT_PROMPT` — `backend/widget_studio/prompts.py`
- [x] `QUERY_BUILDER_AGENT_PROMPT`
- [x] `QUERY_TRANSLATOR_AGENT_PROMPT` (LLM stub; translation is deterministic)
- [x] `DOMAIN_GUARD_PROMPT` + `backend/widget_studio/domain_guard.py`

### 2.3 Agent implementations

- [x] `ClarificationAgent` — `agentscope/clarification_agent.py`
- [x] `QueryBuilderAgent` — `agentscope/query_builder_agent.py`
- [x] `QueryTranslatorAgent` — deterministic `query_translator.py`
- [x] `OrchestratorAgent` — `orchestrator.py`

### 2.4 Query executor

- [x] `query_executor.py`

### 2.5 Category context loader

- [x] `context_loader.py`

---

## 3. Backend — API Endpoints

### 3.1 Chat session endpoints

- [x] `POST /widget-studio/sessions`
- [x] `GET /widget-studio/sessions`
- [x] `GET /widget-studio/sessions/:sessionId/messages`
- [x] `DELETE /widget-studio/sessions/:sessionId`

### 3.2 Chat message / agent endpoint

- [x] `POST /widget-studio/sessions/:sessionId/message`
- [ ] SSE streaming — **deferred** (non-blocking JSON response implemented)

### 3.3 Widget save endpoints

- [x] `POST /widget-studio/widgets`
- [x] `GET /widget-studio/widgets`
- [x] `GET /widget-studio/widgets/:widgetId/render`
- [x] `DELETE /widget-studio/widgets/:widgetId`
- [x] `PATCH /widget-studio/widgets/:widgetId` (rename)
- [x] `POST /widget-studio/widgets/:widgetId/add-to-dashboard`

### 3.4 Super admin debug endpoints

- [x] `GET /widget-studio/sessions/:sessionId/logs`
- [x] `GET /widget-studio/widgets/:widgetId/debug`

---

## 4. Security & Guardrails

- [x] Authenticated endpoints (`get_current_user`)
- [x] User ID injected server-side in query executor
- [x] Mapping only in `query_translator.py`
- [x] QueryExecutor validation (SELECT, transactions, user_id, no DDL/DML)
- [x] Off-topic refusal in prompts + `domain_guard.py`
- [x] Safe user-facing errors
- [x] Agent logs super-admin only
- [x] Rate limit 20/min (`widget_studio_message_rate_limit_per_minute`)

---

## 5. Frontend — Widget Studio UI

### 5.1 Chat panel

- [x] Typing / “Widget generating…” indicator
- [x] Clarification question bubbles
- [x] Checklist card
- [x] Chart type chips
- [x] Preview loader while agent runs

### 5.2 Live preview panel

- [x] Real-time preview from orchestrator
- [x] Filter summary bar
- [x] “No filters applied” when defaults
- [x] Metric + chart rendering
- [x] Broken widget state

### 5.3 Save flow

- [x] Save as new + Save and add to dashboard
- [x] Widget name input
- [x] Discard draft
- [x] Session linked to widget on save

### 5.4 Left library panel

- [x] Name, type, context menu (edit, delete, add to dashboard)
- [x] Click to render with filters
- [x] Broken indicator (⚠)

### 5.5 Filter panel

- [x] Date presets via `FilterBar` / `DateRangePicker`
- [x] Bank dropdown
- [x] Clear via FilterBar defaults
- [x] Debounced 300ms re-render for library widgets
- [x] Session-level filters only

### 5.6 Super admin debug panel

- [x] `WidgetStudioDebugPanel` — abstract/resolved query, result, error, copy query, agent logs

---

## 9. Error Handling

| Case | Done |
|------|------|
| Category deleted | ☑ |
| 3 clarification loops | ☑ |
| DB execution error | ☑ |
| Off-topic | ☑ |
| Prompt injection | ☑ |
| Network timeout (90s) | ☑ |

---

## 10. Logging Requirements

- [x] `widget_agent_logs` per agent call
- [x] `widget_chat_messages` with metadata
- [x] Execution success/failure metadata (no raw transaction rows in logs)
- [x] Super admin session logs endpoint

---

## 11. Build Order

1. [x] Database migrations
2. [x] Query translator + executor
3. [x] Clarification + query builder agents
4. [x] Orchestrator
5. [x] API endpoints
6. [x] Frontend
7. [x] Save/discard
8. [x] Filter re-render
9. [x] Super admin debug
10. [x] Security pass
11. [x] Error handling tests
12. [x] Rate limiting

---

## Changelog

| Date | Notes |
|------|-------|
| 2026-05-19 | Initial spec saved |
| 2026-05-19 | Full implementation — backend + frontend + tests |
