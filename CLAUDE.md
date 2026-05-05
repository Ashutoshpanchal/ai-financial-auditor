# AI Personal Finance Auditor — Claude Context

## Project
Full-stack AI finance auditor: FastAPI + LangChain/LangGraph + React + PostgreSQL/pgvector + Docker.

**Repo:** https://github.com/Ashutoshpanchal/ai-financial-auditor  
**Spec:** docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md

## Tech Stack
- **Frontend:** React + TypeScript + Tailwind CSS + Recharts (Vite)
- **Backend:** FastAPI + Python 3.11
- **AI:** LangChain (audit pipeline) + LangGraph (multi-agent chat)
- **LLM:** OpenRouter (single provider — Llama 3.3, DeepSeek, Mistral)
- **Embeddings:** OpenRouter (`openai/text-embedding-3-small`)
- **Database:** PostgreSQL 15 + pgvector
- **Auth:** Google OAuth2 (openid + email + profile + drive.file scopes)
- **Storage:** Google Drive per-user (drive.file scope)
- **Observability:** LangSmith + Langfuse (toggle via `OBSERVABILITY_BACKENDS` env var)
- **Knowledge Graph:** Graphify (post-audit spending visualization)
- **Infra:** Docker + Docker Compose

## Project Structure
```
/frontend        → React dashboard (Vite + TypeScript)
/backend         → FastAPI application
  /agents        → LangGraph multi-agent chat nodes
  /chains        → LangChain audit pipeline
  /parsers       → CSV + PDF statement parsers
  /models        → SQLAlchemy ORM models
  /prompts       → LLM prompt templates
  /services      → Google OAuth, Drive, observability
  /routers       → FastAPI route handlers
  /middleware    → Auth, RBAC middleware
/docker          → Docker Compose + Dockerfiles
/migrations      → SQL migration files (ordered numerically)
/docs            → Design specs and documentation
/.claude/skills  → Custom Claude skills
```

## Roles
- `super_admin` — set via `SUPER_ADMIN_EMAIL` in .env
- `admin` — can manage users
- `user` — standard, sees only own data (Row Level Security)

## Coding Rules
- Always type hint Python functions
- Handle exceptions explicitly — never silent fails
- Every Python function must have a docstring
- No hardcoded values — use .env + `backend/config.py`
- One responsibility per function

## Custom Skills (run in Claude Code)
- `/test`     — run pytest + TypeScript type-check
- `/review`   — code review of current branch
- `/optimize` — profile slow paths and suggest improvements

## Environment
Copy `.env.example` to `.env` and fill in:
- `SUPER_ADMIN_EMAIL` — your Google email
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `OPENROUTER_API_KEY`
- `LANGSMITH_API_KEY` (optional)
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (optional, used if self-hosted Langfuse is running)
- `OBSERVABILITY_BACKENDS` — comma-separated: `langsmith`, `langfuse`, or `langsmith,langfuse`

## Resume Context
If starting a new session, read:
1. This file (CLAUDE.md)
2. `docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md` — full design
3. `PROGRESS.md` — implementation progress tracker
