# AI Personal Finance Auditor — Design Spec
**Date:** 2026-05-05  
**Status:** Approved  
**Repo:** https://github.com/Ashutoshpanchal/ai-financial-auditor

---

## 1. Purpose

A multi-user AI-powered personal finance auditor that ingests bank statements (CSV/PDF) stored in Google Drive, runs LangChain audit pipelines, enables conversational querying via LangGraph multi-agent chat, and visualizes spending patterns as a Graphify knowledge graph.

---

## 2. Architecture

```
Browser (React + TypeScript + Tailwind + Recharts)
    │
    ▼
FastAPI (Python)
    ├── Auth: Google OAuth2 (openid + email + profile + drive.file)
    ├── Role middleware: super_admin → admin → user
    │
    ├── /upload  ──► Google Drive (per-user folder)
    │                └── AI-Financial-Auditor/{YYYY-MM-DD}/{file}
    │
    ├── /audit   ──► LangChain Audit Chain
    │                ├── Parser (CSV / PDF)
    │                ├── OpenRouter LLM (Llama 3.3 / DeepSeek / Mistral)
    │                ├── pgvector embeddings (transactions table)
    │                ├── Observability: LangSmith + Langfuse (env toggle)
    │                └── Graphify → spending knowledge graph
    │
    └── /chat    ──► LangGraph Multi-Agent
                     ├── RAG Agent (pgvector similarity search)
                     ├── Analysis Agent (trend detection)
                     ├── OpenRouter LLM
                     └── Observability callbacks

PostgreSQL + pgvector
Docker Compose (backend, frontend, postgres, langfuse)
```

---

## 3. Auth & Roles

- **Provider:** Google OAuth2
- **Scopes:** `openid email profile drive.file`
- **drive.file:** App sees only files it created — no access to user's other Drive content
- **Session:** JWT stored in httpOnly cookie, refreshed via Google token refresh
- **Roles:**
  - `super_admin` — hardcoded via `SUPER_ADMIN_EMAIL` env var (project owner)
  - `admin` — invited by super_admin, can manage users
  - `user` — standard access, sees only own data

---

## 4. Google Drive Storage

- Per-user folder structure (created on first upload):
  ```
  My Drive/
    AI-Financial-Auditor/
      {YYYY-MM-DD}/
        {bank_name}_{timestamp}.pdf
        {bank_name}_{timestamp}.csv
  ```
- Drive file ID stored in `documents` table for retrieval
- Parser fetches file from Drive via Google Drive API using stored token

---

## 5. Database Schema

All tables include `user_id` column + Row Level Security enabled.

```sql
-- Users
users (id, google_id, email, name, role, created_at)

-- Documents (uploaded files)
documents (id, user_id, filename, drive_file_id, drive_folder, bank_name, upload_date, status)

-- Transactions (all banks, one table)
transactions (
  id, user_id, document_id, bank_name,
  date, description, amount, category,
  embedding vector(1536),  -- pgvector for RAG
  created_at
)

-- Audit Reports
audit_reports (id, user_id, document_id, summary, insights, graph_json, created_at)

-- Chat Sessions
chat_sessions (id, user_id, messages jsonb, created_at)
```

---

## 6. AI Pipeline

### LangChain Audit Chain (`/backend/chains/audit.py`)
1. Fetch PDF/CSV from Google Drive
2. Parse → structured transactions
3. Embed transactions → pgvector
4. Run audit prompt → OpenRouter LLM
5. Return: summary, categories, anomalies, recommendations
6. Pipe output to Graphify → knowledge graph JSON

### LangGraph Chat Agent (`/backend/agents/chat.py`)
- Nodes: `intake → rag_retrieval → analysis → response`
- RAG: pgvector similarity search on user's transactions
- Tools: `search_transactions`, `get_summary`, `compare_months`

### Observability (`/backend/config.py` → `ObservabilityManager`)
```
OBSERVABILITY_BACKENDS=langsmith,langfuse   # comma-separated
```
Reads env var, instantiates active callback handlers, injects into all chains/agents.

---

## 7. Graphify Integration

After each audit:
1. Audit output (categories, merchants, amounts) → Graphify input
2. Graphify generates: `graph.html` + `graph.json` + audit report
3. `graph.json` stored in `audit_reports.graph_json`
4. React dashboard renders interactive knowledge graph panel via iframe or embedded HTML

---

## 8. Frontend Routes

```
/                    → Landing / Login (Google OAuth button)
/dashboard           → Main dashboard (charts, recent audits)
/upload              → Upload bank statement (CSV/PDF → Drive)
/audit/:id           → Audit report + Graphify knowledge graph
/chat                → LangGraph multi-agent chat
/admin               → User management (admin/super_admin only)
```

---

## 9. Custom Claude Skills

Located at `/Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor/.claude/skills/`

- `/test` — runs `pytest backend/` + `tsc --noEmit` frontend, reports failures with file:line
- `/review` — spawns code review subagent on current branch diff vs main
- `/optimize` — analyzes slow queries (EXPLAIN ANALYZE), hot LLM paths, suggests caching

---

## 10. Docker Compose Services

| Service | Port | Description |
|---|---|---|
| frontend | 3000 | React + Vite dev server |
| backend | 8000 | FastAPI app |
| postgres | 5432 | PostgreSQL + pgvector |
| langfuse | 3001 | Self-hosted observability |

---

## 11. Environment Variables

```env
# App
SECRET_KEY=
SUPER_ADMIN_EMAIL=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small

# Database
DATABASE_URL=

# Observability (comma-separated: langsmith, langfuse, or both)
OBSERVABILITY_BACKENDS=langsmith,langfuse
LANGSMITH_API_KEY=
LANGCHAIN_PROJECT=ai-financial-auditor
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=http://langfuse:3000
```

---

## 12. Implementation Order

1. Docker Compose + Postgres + pgvector setup
2. FastAPI scaffold + Google OAuth + JWT + roles
3. Google Drive service (upload, folder creation, fetch)
4. DB models (SQLAlchemy) + migrations
5. CSV + PDF parsers
6. LangChain audit chain + OpenRouter integration
7. pgvector embedding pipeline
8. Observability manager (LangSmith + Langfuse toggle)
9. Graphify integration post-audit
10. LangGraph multi-agent chat
11. React frontend (auth → dashboard → upload → audit → chat)
12. Custom skills (/test, /review, /optimize)
