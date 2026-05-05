---
name: quality
description: Run full quality gate — parallel lint, review, and test subagents for both frontend and backend. Dispatch with /quality.
---

# /quality — Full Quality Gate

Dispatches **3 subagents in parallel** to validate code quality. Claude fixes issues and re-runs until all pass.

## When to Use

- After implementing a feature or bugfix
- Before committing code
- When user types `/quality`

## Workflow

```
1. Claude dispatches 3 subagents IN PARALLEL:
   ├── Lint Agent      → ruff + pyright (backend) + ESLint + tsc (frontend)
   ├── Review Agent    → correctness, security, coding rules, spec alignment
   └── Test Writer     → writes pytest + Vitest tests for new/modified code
        ↓
2. Collect results from all 3 subagents
3. Claude fixes ALL reported issues
4. Dispatch Test Runner Agent → runs pytest + Vitest
5. If failures → fix → re-run (max 3 loops)
6. Update graphify files
7. Commit
```

## Step 1: Dispatch Parallel Subagents

Use the Agent tool to spawn all 3 subagents simultaneously:

### Subagent A — Lint Agent

```
You are a linting subagent for the AI Financial Auditor project.

Run these checks and report ALL failures with file:line references:

Backend:
1. cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor
2. ruff check backend/ — report each violation with file:line:code
3. ruff format backend/ --check — report formatting issues
4. pyright backend/ — report type errors

Frontend:
1. cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor/frontend
2. npx eslint src/ --max-warnings=0 — report each violation
3. npx tsc --noEmit — report type errors

Format output as:
## Lint Results

### Backend
- [file:line] CODE — description

### Frontend
- [file:line] CODE — description

Summary: X issues (Y backend, Z frontend)
```

### Subagent B — Review Agent

```
You are a code review subagent for the AI Financial Auditor project (FastAPI + LangChain + React).

Review the git diff (git diff HEAD) for:

1. Correctness — does the code do what it claims?
2. Security — SQL injection, auth bypass, hardcoded secrets, XSS, unsafe eval
3. Coding rules violations:
   - Missing type hints on Python functions
   - Silent exception handling (bare except / pass)
   - Missing docstrings on Python functions
   - Hardcoded values that should be in .env / config.py
   - One responsibility per function
4. Spec alignment — does this match docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md?
5. Performance — N+1 queries, missing indexes, unnecessary LLM calls

Format each issue as:
- [file:line](file#Lline) — **[SEVERITY: HIGH/MED/LOW]** description

Summary: X issues (Y high, Z medium, W low)
```

### Subagent C — Test Writer Agent

```
You are a test writing subagent for the AI Financial Auditor project.

Look at the git diff (git diff HEAD) and write test cases for all NEW or MODIFIED
functions/components that don't already have tests.

Backend (pytest):
- Create/update files in backend/tests/
- Use pytest-asyncio for async functions
- Mock external APIs (OpenRouter, Google Drive, LangSmith)
- Follow existing test patterns in backend/tests/conftest.py
- Aim for >80% coverage on new code

Frontend (Vitest + React Testing Library):
- Create *.test.tsx files alongside components
- Use @testing-library/react for component tests
- Mock API calls with vi.mock()
- Follow existing test patterns in frontend/src/test/setup.ts

For each test file created/modified, report:
- [file] — X test cases written (list test names)

Summary: X test files created/modified, Y total test cases
```

## Step 2: Collect & Fix

After all 3 subagents complete:

1. **Lint issues** — Claude fixes:
   - Run `ruff check backend/ --fix` and `ruff format backend/` for auto-fixable issues
   - Manually fix pyright type errors
   - Run `npx eslint frontend/src/ --fix` for auto-fixable issues
   - Manually fix tsc type errors

2. **Review issues** — Claude fixes each HIGH/MED/LOW issue

3. **Test files** — Verify test files were created correctly

## Step 3: Test Runner

Dispatch a final subagent:

```
You are a test runner subagent.

Run the full test suite and report results:

1. cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor
2. pytest backend/tests/ -v --tb=short — report pass/fail with file:line
3. cd frontend && npx vitest run --reporter=verbose — report pass/fail with file:line

Format:
## Test Results
### Backend (pytest)
- PASS: X tests / FAIL: Y tests
  - [file:line] — test_name — failure_reason

### Frontend (Vitest)
- PASS: X tests / FAIL: Y tests
  - [file:line] — test_name — failure_reason
```

## Step 4: Loop

If Test Runner reports failures:
1. Claude fixes the failing code/tests
2. Re-dispatch Test Runner
3. **Maximum 3 loops** — if still failing after 3, report to user for manual intervention

## Step 5: Graphify Update

After all tests pass:

```bash
cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor
if [ -f graphify-out/graph.json ]; then
  graphify . --update
else
  graphify .
fi
```

## Step 6: Commit

```bash
git add -A
git commit -m "feat/fix: <description>

Quality gate:
- Lint: PASS (ruff, pyright, eslint, tsc)
- Review: PASS (X issues fixed)
- Tests: PASS (X backend, Y frontend)
- Graphify: updated"
```

## Output Format

Present results after each round:

```
## Quality Gate — Round N

### Lint Agent
- Backend: X issues → fixed
- Frontend: Y issues → fixed

### Review Agent
- HIGH: X issues → fixed
- MED: Y issues → fixed
- LOW: Z issues → fixed

### Test Writer
- Created: backend/tests/test_X.py (N tests)
- Created: frontend/src/components/X.test.tsx (N tests)

### Test Runner
- Backend: N passed, 0 failed ✓
- Frontend: N passed, 0 failed ✓

Status: PASS ✓ — committing
```
