# Graph Report - AI-Finanical-Advisor  (2026-05-07)

## Corpus Check
- 75 files · ~41,058 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1049 nodes · 1347 edges · 115 communities (75 shown, 40 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 240 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e2b85c0c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]

## God Nodes (most connected - your core abstractions)
1. `parse_csv()` - 21 edges
2. `User` - 20 edges
3. `get_settings()` - 19 edges
4. `set_rls_user()` - 19 edges
5. `analyze_and_categorize()` - 17 edges
6. `_make_csv()` - 17 edges
7. `Transaction` - 16 edges
8. `upload_document()` - 14 edges
9. `ChatSession` - 13 edges
10. `run_audit()` - 13 edges

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

## Communities (115 total, 40 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (43): _build_text(), embed_transactions(), _get_embeddings_batch(), Generate pgvector embeddings for transactions using the OpenRouter API., Generate embeddings for every transaction and persist them to the database., Generate embeddings for every transaction and persist them to the database., Build a single text representation of a transaction for embedding.      Combines, Build a single text representation of a transaction for embedding.      Combines (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (46): get_db(), _make_engine(), Database session factory and dependency injection for FastAPI., Create SQLAlchemy engine from DATABASE_URL in settings., Create SQLAlchemy engine from DATABASE_URL in settings., FastAPI dependency — yields a DB session and closes it after the request., FastAPI dependency — yields a DB session and closes it after the request., Set the PostgreSQL session variable used by Row Level Security policies. (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (30): parse_csv(), Parse bank CSV statements into a normalised list of transaction dicts., Read CSV bytes into a DataFrame, trying UTF-8 then latin-1 encoding.      Args:, Parse a bank CSV statement into a list of transaction dicts.      Supports commo, _read_csv_bytes(), _make_csv(), Tests for backend.parsers.csv_parser — CSV statement parsing logic., A row with a value in 'Withdrawal (Dr)' column should have debit > 0. (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (26): Document, Represents one uploaded bank statement (CSV or PDF)., Represents one uploaded bank statement (CSV or PDF)., Represents one uploaded bank statement (CSV or PDF)., Represents one uploaded bank statement (CSV or PDF)., _drive_result(), _mock_db(), Integration tests for upload and transaction endpoints.  Uses FastAPI TestClient (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (14): ProtectedRoute(), AuthProvider(), useAuth(), handleCreateUser(), handleDelete(), handlePasswordChange(), handleRoleChange(), showSuccess() (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (38): _build_llm(), _format_transactions(), _get_date_range(), _parse_llm_response(), LangChain audit pipeline — parses transactions, audits via OpenRouter LLM, runs, Extract date range string from transaction list., Extract date range string from transaction list., Save Graphify HTML to a static path and return the relative URL path.      TODO: (+30 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (35): Audit Prompt Template, _build_llm (OpenRouter LLM), _format_transactions, _parse_llm_response, run_audit Pipeline, AuditReport Model, AuthMiddleware, SQLAlchemy Base (+27 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (21): delete_category_master_entry(), Delete a category_master row by id.      Raises 404 if the entry does not exist., Delete a category_master row by id.      Raises 404 if the entry does not exist., Delete a category_master row by id.      Restricted to admin/super_admin — the d, Update parent_category, sub_category, and/or payment_method for a description ma, Update parent_category, sub_category, and/or payment_method for a description ma, Update parent_category, sub_category, and/or payment_method for a description ma, update_description_category() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (33): FastAPI Backend, Google Drive Per-User Storage, Graphify Knowledge Graph Service, LangChain Audit Pipeline, LangGraph Multi-Agent Chat, AuditReport ORM Model, SQLAlchemy Declarative Base, ChatSession ORM Model (+25 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (18): CategoryMaster, SQLAlchemy ORM model for the category_master table., Global parent/sub-category dictionary shared across all users.      Rows are pre, Global parent/sub-category dictionary shared across all users.      Rows are pre, create_category_master_entry(), Add a new sub-category entry to the global category_master table.      Raises 40, Add a new sub-category entry to the global category_master table.      Raises 40, Add a new sub-category entry to the global category_master table.      Restricte (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (25): create_user(), delete_user(), get_user(), list_users(), Admin router — user management endpoints for admin and super_admin roles.  Endpo, Return full details for a single user by their ID.      Only admin and super_adm, Return full details for a single user by their ID.      Only admin and super_adm, Create a new user account without requiring Google OAuth.      The password is h (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (25): db_session(), engine(), mock_embeddings(), mock_llm(), mock_settings(), Shared pytest fixtures for the AI Financial Auditor test suite., Return a sample user ID for tests., Return a sample user ID for tests. (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (19): _clean_remark_part(), _extract_bank_name(), _extract_from_tables(), _extract_from_text(), _is_numeric(), _parse_amount(), parse_pdf(), _parse_remarks() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (12): _find_column(), Return the first column whose header contains any keyword (case-insensitive)., Tests for the _find_column helper function., Exact keyword match should be returned regardless of case., Column header 'Withdrawal (Dr)' should match the 'withdrawal' keyword., Column header 'Deposit (Cr)' should match the 'deposit' keyword., Should return None when no keyword matches any column header., Exact keyword match should win over substring match. (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (12): _parse_llm_json(), Strip optional markdown fences from LLM output and parse as JSON array., Strip optional markdown fences from LLM output and parse as JSON array., Tests for the LLM JSON response parser., Plain JSON array without fences should parse correctly., JSON wrapped in ```json ... ``` fences should be stripped before parsing., JSON wrapped in ``` ... ``` without language hint should parse., Empty JSON array should return an empty list. (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (12): _build_category_hierarchy(), Build a {parent_category: [sub_category, ...]} dict from ORM rows., Build a {parent_category: [sub_category, ...]} dict from ORM rows., Build a {parent_category: [sub_category, ...]} dict from ORM rows., Tests for the category hierarchy builder., Return a mock CategoryMaster row., A single row should produce a single-key dict with one sub-category., Multiple rows with the same parent should be grouped under one key. (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (11): list_description_categories(), Return all description_categories rows owned by the current user.      Applies R, Return all description_categories rows owned by the current user.      Applies R, Return all description_categories rows owned by the current user.      Applies R, Return all description_categories rows owned by the current user.      Applies R, Unit tests for list_description_categories., list_description_categories must return a list of dicts., Each result dict must contain all required fields. (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (14): analyze_and_categorize(), Run LLM categorization for all distinct transaction descriptions of the current, Run LLM categorization for all distinct transaction descriptions of the current, Run LLM categorization for all distinct transaction descriptions of the current, Run LLM categorization for all distinct transaction descriptions of the current, Tests for backend.routers.categories — category management endpoints and helpers, Tests for the analyze_and_categorize endpoint., Return a mock DB with configurable query results. (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (15): _build_drive_client(), fetch_file_bytes(), _get_or_create_folder(), _local_upload(), Google Drive service — creates per-user folders, uploads files, fetches content., Download a file from Google Drive by its file ID, or read from local disk., Build an authenticated Google Drive API client from stored tokens., Build an authenticated Google Drive API client from stored tokens. (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (15): health_check(), _init_db(), FastAPI application entry point — registers all routers and startup hooks., Enable extensions, run pending migrations, then create any missing tables., Enable extensions, run pending migrations, then create any missing tables., Liveness probe for Docker health checks., Liveness probe for Docker health checks., # TODO: app.include_router(documents.router) (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (13): Base, DeclarativeBase, AuditReport, AuditReport model — stores LangChain audit output including Graphify knowledge g, One audit report per document — stores structured insights + Graphify graph data, One audit report per document — stores structured insights + Graphify graph data, Base, SQLAlchemy declarative base — shared by all models. (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (13): list_category_master(), Return all category_master rows grouped by parent_category, including IDs., Return all category_master rows grouped by parent_category, including IDs., Return all category_master rows grouped by parent_category, including IDs., _make_mock_category_master_row(), _make_mock_db_with_master_rows(), Return a mock Session whose select(CategoryMaster) returns the given rows., Create a minimal mock CategoryMaster row. (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (13): get_current_user(), Auth middleware — JWT verification and role-based access control., Extract and verify JWT from Authorization header. Raises 401 if invalid., Extract and verify JWT from Authorization header. Raises 401 if invalid., Extract and verify JWT from Authorization header. Raises 401 if invalid., Dependency factory — raises 403 if the current user's role is not in allowed rol, Dependency factory — raises 403 if the current user's role is not in allowed rol, Dependency factory — raises 403 if the current user's role is not in allowed rol (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.16
Nodes (13): get_session(), Chat router — FastAPI endpoints for managing chat sessions and sending messages., Send a user message to the finance agent and receive a response.      Loads the, Send a user message to the finance agent and receive a response.      Loads the, Retrieve a single chat session including its complete message history.      Args, Retrieve a single chat session including its complete message history.      Args, Response body returned after the agent processes a message., Response body returned after the agent processes a message. (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (13): _build_langfuse_handler(), _configure_langsmith(), get_callbacks(), ObservabilityManager — builds LangChain callback list from env toggle.  Usage:, Return active observability callback handlers based on OBSERVABILITY_BACKENDS en, Return active observability callback handlers based on OBSERVABILITY_BACKENDS en, Return active observability callback handlers based on OBSERVABILITY_BACKENDS en, Set LangSmith env vars — LangSmith uses env vars rather than a callback handler. (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (10): _hierarchy_to_text(), Convert category hierarchy dict to a human-readable string for LLM prompts., Convert category hierarchy dict to a human-readable string for LLM prompts., Convert category hierarchy dict to a human-readable string for LLM prompts., Empty hierarchy should return an empty string., Tests for the hierarchy-to-text converter., Single parent with one sub should produce one line., Multiple subs should be joined with ', '. (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (9): intake_node(), Validate the latest user message and extract structured intent.      Reads the l, Validate the latest user message and extract structured intent.      Reads the l, Validate the latest user message and extract structured intent.      Reads the l, Tests for backend.agents.nodes — LangGraph node functions., test_intake_node_compare_months_intent(), test_intake_node_no_user_message_raises(), test_intake_node_search_transactions_intent() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (12): _build_llm(), _chunks(), list_payment_methods(), FastAPI router for category management — master dictionary and per-user descript, Return the fixed list of allowed payment method labels.      No authentication r, Return the fixed list of allowed payment method labels.      No authentication r, Return the fixed list of allowed payment method labels.      No authentication r, Return the fixed list of allowed payment method labels.      No authentication r (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (8): get_settings(), Central configuration — all env vars loaded here, never hardcoded elsewhere., Application settings loaded from environment variables., Application settings loaded from environment variables., Return cached settings instance — call this everywhere instead of instantiating, Return cached settings instance — call this everywhere instead of instantiating, Settings, BaseSettings

### Community 29 - "Community 29"
Cohesion: 0.2
Nodes (9): _last_user_message(), Return the content of the most recent user message in the history.      Args:, Return the content of the most recent user message in the history.      Args:, Return the content of the most recent user message in the history.      Args:, Tests for the _last_user_message helper., Should return the content of the most recent user message., Should return None when there are no user messages., Should return None for an empty message list. (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (11): _build_embeddings(), _embed_query(), LangChain tools for the AI Finance Agent.  Each tool is a plain function that qu, Build an OpenAIEmbeddings client pointed at OpenRouter.      Returns:         Co, Build an OpenAIEmbeddings client pointed at OpenRouter.      Returns:         Co, Embed a single query string using the configured OpenRouter embeddings model., Embed a single query string using the configured OpenRouter embeddings model., test_build_embeddings_returns_instance() (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (7): Tests for the PAYMENT_METHODS constant used by the endpoint., PAYMENT_METHODS must be a list., PAYMENT_METHODS must contain at least one method., UPI must be in the payment methods list., Every payment method label must be a non-empty string., Spot-check well-known methods are all present., TestPaymentMethodsConstant

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (12): Admin Page, API Service, ProtectedRoute Usage, React Router Setup, AuditReport Page, Chat Page, Dashboard Page, GraphifyPanel Component (+4 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (11): AgentState, Shared state passed between LangGraph nodes.      Attributes:         messages:, Shared state passed between LangGraph nodes.      Attributes:         messages:, Shared state passed between LangGraph nodes.      Attributes:         messages:, Tests for the response_node graph node., Tests for the _build_llm helper., Tests for the intake_node graph node., TestBuildLlm (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (8): get_anomalies(), Fetch all audit reports for the user and extract anomalies from their insights J, Fetch all audit reports for the user and extract anomalies from their insights J, Tests for the get_anomalies tool., get_anomalies should return formatted anomalies., get_anomalies should return a message when no reports exist., get_anomalies should handle reports with empty anomaly lists., TestGetAnomalies

### Community 35 - "Community 35"
Cohesion: 0.2
Nodes (10): DevLoginRequest, google_callback(), Request body for the development-only password login., Request body for the development-only password login., Google OAuth2 callback — exchanges code for tokens, upserts user, sets JWT cooki, Google OAuth2 callback — exchanges code for tokens, upserts user, sets JWT cooki, get_google_user_info(), Fetch Google user profile using the access token. (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.2
Nodes (9): get_me(), logout(), Auth router — Google OAuth2 login, dev bypass, and session endpoints., Clear the JWT cookie to end the session., Clear the JWT cookie to end the session., Return the authenticated user's profile., Return the authenticated user's profile., Clear the JWT cookie to end the session. (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (10): BaseModel, Request body for changing a user's role., Request body for changing a user's role., Request body for setting/changing a user's password., Request body for setting/changing a user's password., UpdatePasswordRequest, UpdateRoleRequest, Request body for sending a message to an existing session. (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (9): analysis_node(), _build_llm(), LangGraph node functions for the AI Finance Agent.  Each node is an async functi, Call the LLM to synthesise tool outputs into a coherent financial insight., Call the LLM to synthesise tool outputs into a coherent financial insight., Call the LLM to synthesise tool outputs into a coherent financial insight., Build a ChatOpenAI client pointed at OpenRouter using settings from config., Build a ChatOpenAI client pointed at OpenRouter using settings from config. (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (9): _build_graph(), LangGraph StateGraph for the AI Finance Agent.  Builds and compiles the multi-no, Construct and compile the LangGraph StateGraph for the finance agent.      The r, Construct and compile the LangGraph StateGraph for the finance agent.      The r, # NOTE: Do NOT invoke `finance_graph` directly in production code — always call, # NOTE: Do NOT invoke `finance_graph` directly in production code — always call, Run the finance agent graph for one user turn and persist the updated history., Run the finance agent graph for one user turn and persist the updated history. (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (8): ChatSession, ChatSession model — persists LangGraph multi-agent conversation history., One session per user conversation thread with the finance agent., One session per user conversation thread with the finance agent., One session per user conversation thread with the finance agent., CreateSessionRequest, Request body for creating a new chat session., Request body for creating a new chat session.

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): User model — all roles share this table; role column controls access level., Role hierarchy: super_admin > admin > user., Role hierarchy: super_admin > admin > user., Role hierarchy: super_admin > admin > user., UserRole, CreateUserRequest, Request body for creating a new user directly (no Google OAuth)., Request body for creating a new user directly (no Google OAuth).

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (8): Find transactions relevant to a natural language query using pgvector cosine sim, Find transactions relevant to a natural language query using pgvector cosine sim, search_transactions(), search_transactions should raise RuntimeError when embedding fails., Tests for the search_transactions tool., test_search_transactions_no_results(), test_search_transactions_returns_results(), TestSearchTransactions

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): get_spending_summary(), Aggregate total spend per category for all of the user's transactions.      Args, Aggregate total spend per category for all of the user's transactions.      Args, Tests for the get_spending_summary tool., get_spending_summary should return a markdown table., get_spending_summary should return a message when no transactions., TestGetSpendingSummary

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (7): compare_months(), Compare total spend and category breakdown between two calendar months.      Arg, Compare total spend and category breakdown between two calendar months.      Arg, Tests for the compare_months tool., compare_months should return a comparison report., compare_months should raise ValueError for invalid month format., TestCompareMonths

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (7): dev_login(), Google OAuth2 service — handles login flow, token exchange, and JWT creation., Authenticate via plain password for local development — never call in production, Authenticate via plain password for local development — never call in production, Verify a plaintext password against a stored PBKDF2 hash.      Args:         pas, Verify a plaintext password against a stored PBKDF2 hash.      Args:         pas, verify_password()

### Community 46 - "Community 46"
Cohesion: 0.25
Nodes (8): google_login(), Redirect URL for Google OAuth2 — frontend sends user to this URL., Redirect URL for Google OAuth2 — frontend sends user to this URL., Redirect URL for Google OAuth2 — frontend sends user to this URL., get_google_auth_url(), Build Google OAuth2 authorization URL with all required scopes., Build Google OAuth2 authorization URL with all required scopes., Build Google OAuth2 authorization URL with all required scopes.

### Community 47 - "Community 47"
Cohesion: 0.32
Nodes (8): pgvector Extension, Audit Reports Table, Chat Sessions Table, Database Schema, Documents Table, Transactions Table, Users Table, Row Level Security Policy

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (7): dev_login_endpoint(), Development-only password login for the super_admin — disabled in production., Development-only password login for the super_admin — disabled in production., create_app_jwt(), Create a signed JWT for the app session containing user id and role., Create a signed JWT for the app session containing user id and role., Create a signed JWT for the app session containing user id and role.

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (6): DocumentStatus, Document model — tracks uploaded files and their Google Drive location., Processing lifecycle of an uploaded document., Processing lifecycle of an uploaded document., Processing lifecycle of an uploaded document., str

### Community 50 - "Community 50"
Cohesion: 0.29
Nodes (5): Tests for backend.agents.tools — LangChain tools for the finance agent., Tests for the _build_embeddings helper., Tests for the _embed_query helper., TestBuildEmbeddings, TestEmbedQuery

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): create_session(), CreateSessionResponse, Create a new chat session for the authenticated user.      Args:         body:, Response body returned when a session is created., Response body returned when a session is created., Create a new chat session for the authenticated user.      Args:         body:

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (6): list_sessions(), Return a list of all chat sessions belonging to the authenticated user.      Eac, Return a list of all chat sessions belonging to the authenticated user.      Eac, Lightweight session item used in the list endpoint., Lightweight session item used in the list endpoint., SessionSummary

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (6): Format the final response and append both turns to the message history.      App, Format the final response and append both turns to the message history.      App, Format the final response and append both turns to the message history.      App, response_node(), test_response_node_appends_assistant_message(), test_response_node_preserves_existing_messages()

### Community 55 - "Community 55"
Cohesion: 0.4
Nodes (5): Represents an authenticated user — created on first Google OAuth login., Represents an authenticated user — created on first Google OAuth login., Represents an authenticated user — created on first Google OAuth login., Represents an authenticated user — created on first Google OAuth login., User

### Community 57 - "Community 57"
Cohesion: 0.5
Nodes (4): exchange_code_for_tokens(), Exchange OAuth2 authorization code for access + refresh tokens., Exchange OAuth2 authorization code for access + refresh tokens., Exchange OAuth2 authorization code for access + refresh tokens.

### Community 58 - "Community 58"
Cohesion: 0.5
Nodes (4): Create or update a user from Google profile data. Assign super_admin if email ma, Create or update a user from Google profile data. Assign super_admin if email ma, Create or update a user from Google profile data. Assign super_admin if email ma, upsert_user()

### Community 59 - "Community 59"
Cohesion: 0.5
Nodes (4): rag_node(), Execute the tool(s) identified by intake_node and collect results.      Iterates, Execute the tool(s) identified by intake_node and collect results.      Iterates, Execute the tool(s) identified by intake_node and collect results.      Iterates

### Community 60 - "Community 60"
Cohesion: 0.5
Nodes (3): Tests for the LLM factory helper., _build_llm should return a ChatOpenAI instance configured for OpenRouter., TestBuildLlm

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (3): Brand Color Palette (green-based), PostCSS Configuration, Tailwind CSS Configuration

## Knowledge Gaps
- **553 isolated node(s):** `Central configuration — all env vars loaded here, never hardcoded elsewhere.`, `Application settings loaded from environment variables.`, `Return list of enabled observability backend names.`, `True if LangSmith is in the active backends list.`, `True if Langfuse is in the active backends list.` (+548 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_settings()` connect `Community 28` to `Community 0`, `Community 1`, `Community 5`, `Community 38`, `Community 45`, `Community 46`, `Community 48`, `Community 17`, `Community 18`, `Community 22`, `Community 24`, `Community 57`, `Community 58`, `Community 30`?**
  _High betweenness centrality (0.309) - this node is a cross-community bridge._
- **Why does `analyze_and_categorize()` connect `Community 17` to `Community 1`, `Community 14`, `Community 15`, `Community 25`, `Community 27`, `Community 28`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Why does `upload_document()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 12`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `parse_csv()` (e.g. with `upload_document()` and `.test_split_columns_produce_debit_credit_keys()`) actually correct?**
  _`parse_csv()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `User` (e.g. with `DevLoginRequest` and `CreateSessionRequest`) actually correct?**
  _`User` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `get_settings()` (e.g. with `_make_engine()` and `analyze_and_categorize()`) actually correct?**
  _`get_settings()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `set_rls_user()` (e.g. with `list_audit_reports()` and `get_audit_report_by_document()`) actually correct?**
  _`set_rls_user()` has 16 INFERRED edges - model-reasoned connections that need verification._