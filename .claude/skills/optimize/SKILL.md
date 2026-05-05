---
name: optimize
description: Profile slow paths, analyze DB queries, and suggest caching / query improvements for the AI Financial Auditor.
---

# /optimize — Performance Optimization

Analyze and suggest optimizations across backend, database, and AI pipeline.

## Steps

1. **Identify hot paths** — ask user which area to optimize, or scan all:
   - A) Database queries (EXPLAIN ANALYZE)
   - B) LLM call latency (chain/agent invocations)
   - C) Embedding pipeline (bulk vs per-row)
   - D) API response time (FastAPI endpoints)
   - E) Frontend bundle size / render performance

2. **Database analysis**
```bash
# Check for missing indexes
cd backend && python -c "
from models import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text(\"SELECT schemaname, tablename, attname FROM pg_stats WHERE n_distinct < -0.1 AND tablename IN ('transactions','documents','audit_reports')\"))
    print(result.fetchall())
"
```

3. **LLM call audit** — scan chains/ and agents/ for:
   - Calls without caching
   - Sequential calls that could be parallelized
   - Missing `max_tokens` limits

4. **Present recommendations** as:
```
## Optimization Opportunities

### [HIGH IMPACT] Missing index on transactions.user_id
- [backend/models/transaction.py:23](backend/models/transaction.py#L23)
- Add: `Index('ix_transactions_user_id', Transaction.user_id)`
- Estimated impact: 10x faster RAG queries

### [MED IMPACT] Audit chain runs embeddings sequentially
- [backend/chains/audit.py:45](backend/chains/audit.py#L45)
- Switch to async batch embedding: `aembed_documents(texts)`
```

5. **Only suggest changes the user asks to apply** — never auto-apply optimizations.
