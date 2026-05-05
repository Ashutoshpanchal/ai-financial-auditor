# Graph Report - .  (2026-05-05)

## Corpus Check
- Corpus is ~8,099 words - fits in a single context window. You may not need a graph.

## Summary
- 255 nodes · 284 edges · 34 communities (25 shown, 9 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.79)
- Token cost: 3,200 input · 1,800 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Audit Chain & LLM Prompts|Audit Chain & LLM Prompts]]
- [[_COMMUNITY_SQLAlchemy ORM Models|SQLAlchemy ORM Models]]
- [[_COMMUNITY_Architecture Concepts|Architecture Concepts]]
- [[_COMMUNITY_Config & Observability Toggle|Config & Observability Toggle]]
- [[_COMMUNITY_LangChain Audit Pipeline|LangChain Audit Pipeline]]
- [[_COMMUNITY_React Pages & Routing|React Pages & Routing]]
- [[_COMMUNITY_Frontend Auth & Components|Frontend Auth & Components]]
- [[_COMMUNITY_Graphify Knowledge Graph Service|Graphify Knowledge Graph Service]]
- [[_COMMUNITY_Google Drive Service|Google Drive Service]]
- [[_COMMUNITY_Database Session & RLS|Database Session & RLS]]
- [[_COMMUNITY_FastAPI App Entrypoint|FastAPI App Entrypoint]]
- [[_COMMUNITY_Google OAuth Routers|Google OAuth Routers]]
- [[_COMMUNITY_LangSmith + Langfuse Callbacks|LangSmith + Langfuse Callbacks]]
- [[_COMMUNITY_DB Migrations & Schema|DB Migrations & Schema]]
- [[_COMMUNITY_JWT Auth Middleware|JWT Auth Middleware]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `get_settings()` - 12 edges
2. `run_audit()` - 11 edges
3. `Base` - 10 edges
4. `run_audit Pipeline` - 10 edges
5. `FastAPI Backend` - 8 edges
6. `useAuth()` - 7 edges
7. `React Router Setup` - 7 edges
8. `Backend ORM Models Package` - 7 edges
9. `google_callback()` - 6 edges
10. `get_callbacks()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `User ORM Model` --implements--> `Role: super_admin`  [INFERRED]
  backend/models/user.py → CLAUDE.md
- `User ORM Model` --implements--> `Role: admin`  [INFERRED]
  backend/models/user.py → CLAUDE.md
- `User ORM Model` --implements--> `Role: user (Row Level Security)`  [INFERRED]
  backend/models/user.py → CLAUDE.md
- `Vite Dev Server API Proxy to Port 8000` --references--> `FastAPI Backend`  [INFERRED]
  frontend/vite.config.ts → backend/requirements.txt
- `Phase 6: LangGraph Chat` --references--> `ChatSession Model`  [INFERRED]
  PROGRESS.md → backend/models/chat_session.py

## Hyperedges (group relationships)
- **Ordered DB Migration Pipeline** — 001_extensions_pgvector_extension, 002_schema_database_schema, 003_rls_row_level_security [EXTRACTED 0.95]
- **Auth-Guarded Frontend Pages** — dashboard_tsx_dashboard_page, upload_tsx_upload_page, chat_tsx_chat_page, admin_tsx_admin_page [INFERRED 0.85]
- **SQLAlchemy ORM Models** — user_py_user_model, document_py_document_model, transaction_py_transaction_model, audit_report_py_auditreport_model, chat_session_py_chatsession_model [EXTRACTED 0.95]
- **Full Audit Pipeline Flow** — audit_py_run_audit, graphify_service_py_build_audit_graph, observability_py_get_callbacks, audit_prompt_py_audit_prompt [EXTRACTED 0.90]
- **Dual Observability Backends** — observability_py_langsmith_handler, observability_py_langfuse_handler, observability_py_get_callbacks [EXTRACTED 0.95]
- **Frontend Build Toolchain (Vite + Tailwind + PostCSS)** — frontend_vite_config, frontend_tailwind_config, frontend_postcss_config [EXTRACTED 1.00]
- **All SQLAlchemy ORM Models** — backend_model_base, backend_model_user, backend_model_document, backend_model_transaction, backend_model_audit_report, backend_model_chat_session [EXTRACTED 1.00]
- **AI Pipeline Stack (LangChain + LangGraph + OpenRouter)** — backend_langchain_pipeline, backend_langgraph_chat, backend_openrouter_llm [EXTRACTED 1.00]
- **Dual Observability Backends (LangSmith + Langfuse)** — backend_observability, concept_observability_toggle [EXTRACTED 1.00]
- **RBAC Role Hierarchy** — concept_role_super_admin, concept_role_admin, concept_role_user [EXTRACTED 1.00]

## Communities (34 total, 9 thin omitted)

### Community 0 - "Audit Chain & LLM Prompts"
Cohesion: 0.07
Nodes (35): Audit Prompt Template, _build_llm (OpenRouter LLM), _format_transactions, _parse_llm_response, run_audit Pipeline, AuditReport Model, AuthMiddleware, SQLAlchemy Base (+27 more)

### Community 1 - "SQLAlchemy ORM Models"
Cohesion: 0.08
Nodes (25): Base, DeclarativeBase, AuditReport, AuditReport model — stores LangChain audit output including Graphify knowledge g, One audit report per document — stores structured insights + Graphify graph data, Base, SQLAlchemy declarative base — shared by all models., Base class for all ORM models. (+17 more)

### Community 2 - "Architecture Concepts"
Cohesion: 0.09
Nodes (27): FastAPI Backend, Google Drive Per-User Storage, Graphify Knowledge Graph Service, LangChain Audit Pipeline, LangGraph Multi-Agent Chat, AuditReport ORM Model, SQLAlchemy Declarative Base, ChatSession ORM Model (+19 more)

### Community 3 - "Config & Observability Toggle"
Cohesion: 0.1
Nodes (21): get_settings(), Central configuration — all env vars loaded here, never hardcoded elsewhere., Application settings loaded from environment variables., Return cached settings instance — call this everywhere instead of instantiating, Settings, BaseSettings, google_callback(), Google OAuth2 callback — exchanges code for tokens, upserts user, sets JWT cooki (+13 more)

### Community 4 - "LangChain Audit Pipeline"
Cohesion: 0.2
Nodes (13): _build_llm(), _format_transactions(), _get_date_range(), _parse_llm_response(), LangChain audit pipeline — parses transactions, audits via OpenRouter LLM, runs, Extract date range string from transaction list., Save Graphify HTML to a static path and return the relative URL path.      TODO:, Build LangChain LLM client pointed at OpenRouter. (+5 more)

### Community 5 - "React Pages & Routing"
Cohesion: 0.24
Nodes (12): Admin Page, API Service, ProtectedRoute Usage, React Router Setup, AuditReport Page, Chat Page, Dashboard Page, GraphifyPanel Component (+4 more)

### Community 6 - "Frontend Auth & Components"
Cohesion: 0.29
Nodes (5): ProtectedRoute(), AuthProvider(), useAuth(), Dashboard(), Login()

### Community 7 - "Graphify Knowledge Graph Service"
Cohesion: 0.27
Nodes (9): build_audit_graph(), _extract(), Graphify service — converts audit output into a knowledge graph.  Flow:   audit, Run AST extraction (skips for markdown) — semantic extraction via graphify CLI., Run graphify on an audit result dict and return (graph_json, graph_html_string)., Internal — writes audit data to temp files and runs the graphify pipeline., Write audit data as structured markdown files for graphify to process., _run_graphify_pipeline() (+1 more)

### Community 8 - "Google Drive Service"
Cohesion: 0.27
Nodes (9): _build_drive_client(), fetch_file_bytes(), _get_or_create_folder(), Google Drive service — creates per-user folders, uploads files, fetches content., Build an authenticated Google Drive API client from stored tokens., Return folder ID for an existing folder, or create it if absent., Upload a file to the user's Drive under AI-Financial-Auditor/{YYYY-MM-DD}/filena, Download a file from Google Drive by its file ID. Returns raw bytes. (+1 more)

### Community 9 - "Database Session & RLS"
Cohesion: 0.25
Nodes (7): get_db(), _make_engine(), Database session factory and dependency injection for FastAPI., Create SQLAlchemy engine from DATABASE_URL in settings., FastAPI dependency — yields a DB session and closes it after the request., Set the PostgreSQL session variable used by Row Level Security policies., set_rls_user()

### Community 10 - "FastAPI App Entrypoint"
Cohesion: 0.25
Nodes (7): health_check(), FastAPI application entry point — registers all routers and startup hooks., # TODO: app.include_router(documents.router), # TODO: app.include_router(audit.router), # TODO: app.include_router(chat.router), # TODO: app.include_router(admin.router), Liveness probe for Docker health checks.

### Community 11 - "Google OAuth Routers"
Cohesion: 0.25
Nodes (7): get_me(), google_login(), logout(), Auth router — Google OAuth2 login and callback endpoints., Redirect URL for Google OAuth2 — frontend sends user to this URL., Clear the JWT cookie to end the session., Return the authenticated user's profile.

### Community 12 - "LangSmith + Langfuse Callbacks"
Cohesion: 0.32
Nodes (7): _build_langfuse_handler(), _configure_langsmith(), get_callbacks(), ObservabilityManager — builds LangChain callback list from env toggle.  Usage:, Return active observability callback handlers based on OBSERVABILITY_BACKENDS en, Set LangSmith env vars — LangSmith uses env vars rather than a callback handler., Instantiate Langfuse callback handler, return None if import fails.

### Community 13 - "DB Migrations & Schema"
Cohesion: 0.32
Nodes (8): pgvector Extension, Audit Reports Table, Chat Sessions Table, Database Schema, Documents Table, Transactions Table, Users Table, Row Level Security Policy

### Community 14 - "JWT Auth Middleware"
Cohesion: 0.33
Nodes (5): get_current_user(), Auth middleware — JWT verification and role-based access control., Extract and verify JWT from Authorization header. Raises 401 if invalid., Dependency factory — raises 403 if the current user's role is not in allowed rol, require_roles()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (6): User ORM Model, Role: admin, Role: super_admin, Role: user (Row Level Security), Row Level Security (user data isolation), UserRole Enum

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (3): Brand Color Palette (green-based), PostCSS Configuration, Tailwind CSS Configuration

## Knowledge Gaps
- **110 isolated node(s):** `Central configuration — all env vars loaded here, never hardcoded elsewhere.`, `Application settings loaded from environment variables.`, `Return list of enabled observability backend names.`, `True if LangSmith is in the active backends list.`, `True if Langfuse is in the active backends list.` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_settings()` connect `Config & Observability Toggle` to `Database Session & RLS`, `LangChain Audit Pipeline`, `LangSmith + Langfuse Callbacks`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `run_audit()` connect `LangChain Audit Pipeline` to `SQLAlchemy ORM Models`, `Config & Observability Toggle`, `LangSmith + Langfuse Callbacks`, `Graphify Knowledge Graph Service`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `get_settings()` (e.g. with `_make_engine()` and `_build_llm()`) actually correct?**
  _`get_settings()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `run_audit()` (e.g. with `get_settings()` and `get_callbacks()`) actually correct?**
  _`run_audit()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `Base` (e.g. with `AuditReport` and `UserRole`) actually correct?**
  _`Base` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `FastAPI Backend` (e.g. with `Vite Dev Server API Proxy to Port 8000` and `LangChain Audit Pipeline`) actually correct?**
  _`FastAPI Backend` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Central configuration — all env vars loaded here, never hardcoded elsewhere.`, `Application settings loaded from environment variables.`, `Return list of enabled observability backend names.` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._