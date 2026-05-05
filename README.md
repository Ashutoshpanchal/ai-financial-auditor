# AI Personal Finance Auditor

AI-powered personal finance auditor with LangChain audit pipeline, LangGraph multi-agent chat, Graphify knowledge graphs, and Google Drive storage.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS + Recharts |
| Backend | FastAPI + Python 3.11 |
| AI Pipeline | LangChain (audit) + LangGraph (chat) |
| LLM | OpenRouter (Llama 3.3, DeepSeek, Mistral) |
| Database | PostgreSQL 15 + pgvector |
| Auth | Google OAuth2 (drive.file scope) |
| Storage | Google Drive (per-user folders) |
| Observability | LangSmith + Langfuse (toggle via env var) |
| Knowledge Graph | Graphify (post-audit spending visualization) |
| Infra | Docker + Docker Compose |

## Quick Start

```bash
# 1. Copy and fill env vars
cp .env.example .env

# 2. Start all services
cd docker && docker compose up -d

# 3. Backend dev
cd backend && pip install -r requirements.txt
uvicorn backend.main:app --reload

# 4. Frontend dev
cd frontend && npm install && npm run dev
```

## Observability Toggle

```env
# Use LangSmith only
OBSERVABILITY_BACKENDS=langsmith

# Use Langfuse only  
OBSERVABILITY_BACKENDS=langfuse

# Use both simultaneously
OBSERVABILITY_BACKENDS=langsmith,langfuse
```

## Custom Claude Skills

Run these inside Claude Code:
- `/test`     — pytest + TypeScript type-check
- `/review`   — code review of current branch
- `/optimize` — find slow queries and LLM hot paths

## Progress

See [PROGRESS.md](PROGRESS.md) for implementation status.

## Design

See [docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md](docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md) for the full design spec.
