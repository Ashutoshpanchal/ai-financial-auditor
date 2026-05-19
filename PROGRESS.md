# Implementation Progress

> **Resume instructions:** Read CLAUDE.md → this file → pick up the next ☐ item.

## Phase 1 — Infrastructure ✅
- [x] Design spec written
- [x] GitHub repo created: https://github.com/Ashutoshpanchal/ai-financial-auditor
- [x] Project directory scaffolded
- [x] CLAUDE.md written
- [x] PROGRESS.md created
- [x] Custom skills: /test, /review, /optimize, /quality
- [x] .env.example
- [x] docker/docker-compose.yml
- [x] docker/Dockerfile.backend
- [x] docker/Dockerfile.frontend

## Phase 2 — Backend Core ✅
- [x] backend/config.py (all env vars + ObservabilityManager)
- [x] backend/database.py (SQLAlchemy engine + RLS helper)
- [x] backend/models/base.py
- [x] backend/models/user.py
- [x] backend/models/document.py
- [x] backend/models/transaction.py
- [x] backend/models/audit_report.py
- [x] backend/models/chat_session.py
- [x] backend/services/auth.py (Google OAuth)
- [x] backend/services/drive.py (Google Drive)
- [x] backend/middleware/auth.py (JWT + role check)
- [x] backend/routers/auth.py
- [x] backend/routers/documents.py
- [x] backend/routers/audit.py
- [x] backend/routers/chat.py
- [x] backend/routers/admin.py (user management)
- [x] backend/main.py (all routers wired)

## Phase 3 — DB Migrations ✅
- [x] migrations/001_extensions.sql (pgvector)
- [x] migrations/002_schema.sql (users, documents, transactions, audit_reports, chat_sessions)
- [x] migrations/003_rls.sql (Row Level Security)

## Phase 4 — AI Pipeline ✅
- [x] backend/parsers/csv_parser.py
- [x] backend/parsers/pdf_parser.py
- [x] backend/chains/audit.py (LangChain audit)
- [x] backend/chains/embeddings.py (pgvector)
- [x] backend/services/observability.py (LangSmith + Langfuse toggle)
- [x] backend/prompts/audit_prompt.py
- [x] backend/routers/audit.py

## Phase 5 — Graphify Integration ✅
- [x] backend/services/graphify_service.py (post-audit knowledge graph)
- [x] frontend/src/components/audit/GraphifyPanel.tsx

## Phase 6 — LangGraph Chat ✅
- [x] backend/agents/nodes.py
- [x] backend/agents/tools.py
- [x] backend/agents/chat.py (LangGraph graph)
- [x] backend/routers/chat.py

## Phase 7 — Frontend ✅
- [x] frontend setup (Vite + React + TypeScript + Tailwind)
- [x] frontend/src/pages/Login.tsx
- [x] frontend/src/pages/Dashboard.tsx
- [x] frontend/src/pages/Upload.tsx
- [x] frontend/src/pages/AuditReport.tsx
- [x] frontend/src/pages/Chat.tsx
- [x] frontend/src/pages/Admin.tsx (placeholder — full UI pending)
- [x] frontend/src/services/api.ts
- [x] frontend/src/hooks/useAuth.tsx

## Phase 8 — Smart Categorisation ✅
- [x] migrations/007_categories.sql — `category_master` + `description_categories` tables
- [x] migrations/008_rls_categories.sql — RLS on `description_categories`
- [x] backend/models/category_master.py
- [x] backend/models/description_category.py
- [x] backend/prompts/category_prompt.py
- [x] backend/routers/categories.py — 7 endpoints (GET/POST/DELETE master, analyze, PATCH mapping)
- [x] frontend/src/pages/Categories.tsx — Category Dictionary + Description Mappings tabs
- [x] frontend/src/App.tsx — /categories route wired
- [x] backend/tests/test_categories_router.py — 49 tests
- [x] frontend/src/pages/Categories.test.tsx — 38 tests

## Phase 9 — Combined Chat + Dashboard (UX redesign) 🟡
- [x] Filter bar at top — date range, bank, category — charts react to filters (Dashboard + `FilterBar`)
- [x] Dashboard overview / editorial card layout (`dashboard_overview` API + cards)
- [x] **Widget Studio** — `/widget-studio` UI, `POST /widget-studio/*` API, AgentScope agents (`backend/widget_studio/agentscope/`), migrations `015_widget_studio_tables.sql` + `016_widget_definitions_broken.sql`
- [ ] Redesign Dashboard as split-panel: charts (left) + AI chat (right) — still separate Chat page
- [ ] Drag-and-drop widget layout (user can rearrange chart panels)
- [ ] Charts driven by `category` column: pie by category, bar by month, spend trends (partial — existing widgets + studio)
- [ ] Chat panel wired on same page as dashboard filters (LangGraph)
- [ ] "Analyze" on Upload navigates to combined dashboard with pre-loaded audit

## Phase 10 — Polish & Ops 🟡
- [ ] Admin.tsx — full user management UI (list users, change roles)
- [ ] End-to-end test with real Google OAuth + Drive
- [ ] Production Docker image optimisation (multi-stage builds)

## Testing Improvements (deferred) 🟡
- [ ] Replace mocked DB tests with `testcontainers-python` (spins up real PostgreSQL + pgvector in pytest)
      → Catches runtime issues that mocks miss (e.g. TYPE_CHECKING NameError bugs)
      → Add to `pyproject.toml` dev deps: `testcontainers>=4.0.0`
- [ ] Playwright E2E tests against full Docker stack
      → Real browser, real Google OAuth flow, real Drive upload
      → Replaces mock-only coverage for critical user journeys

## Decision Log
- 2026-05-07: Use `description` column to LLM-categorize transactions → powers all dashboard charts
- 2026-05-07: Merge Chat + Dashboard into one split-panel page (conversational BI pattern)
- 2026-05-07: "Analyze" on Upload navigates to combined dashboard (no separate AuditReport page needed)
- 2026-05-07: Chat.tsx as standalone page will be removed once Phase 9 is done
- 2026-05-07: Disabled ruff TC001/TC002/TC003 rules globally — SQLAlchemy Mapped[] + LangGraph get_type_hints() require real runtime imports, not TYPE_CHECKING aliases
- 2026-05-07: Category master table is global (admin-managed); description_categories is per-user with RLS
- 2026-05-07: No confidence column or user_edited boolean on categories — keep schema minimal
- 2026-05-19: Widget Studio uses AgentScope + OpenRouter only for studio agents; legacy `/chat?session_kind=widget_studio` unchanged. Broken widgets: sticky `broken` on `widget_definitions`; dashboard data validates literal categories in `query_config`.

## Last Updated: 2026-05-19
