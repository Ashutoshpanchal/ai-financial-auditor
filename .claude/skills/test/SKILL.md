---
name: test
description: Run full test suite — pytest backend + Vitest frontend. Auto-writes tests for untested code. Reports failures with file:line references.
---

# /test — Test Suite with Auto Test Writer

Runs the full test suite. If new code lacks tests, a Test Writer subagent creates them first.

## When to Use

- After writing new functions/components
- When user types `/test`
- As part of `/quality` workflow

## Steps

### 1. Check for untested new code

```bash
git diff HEAD --name-only
```

For each new/modified `.py` file, check if a corresponding test file exists:
- `backend/routers/foo.py` → `backend/tests/test_routers.py` or `backend/tests/test_foo.py`
- `backend/services/bar.py` → `backend/tests/test_services.py` or `backend/tests/test_bar.py`

For each new/modified `.tsx` file, check for a `.test.tsx` sibling.

### 2. If untested code exists → dispatch Test Writer subagent

```
You are a test writing subagent for the AI Financial Auditor project.

Write test cases for these untested files: [LIST FILES]

Backend (pytest):
- Create/update files in backend/tests/
- Use pytest-asyncio for async functions
- Mock external APIs (OpenRouter, Google Drive, LangSmith)
- Follow patterns in backend/tests/conftest.py
- Cover: happy path, error cases, edge cases

Frontend (Vitest + React Testing Library):
- Create *.test.tsx files alongside components
- Use @testing-library/react
- Mock API calls with vi.mock()
- Cover: render, user interaction, error states

Report each file created with test names and count.
```

### 3. Run full test suite

#### Backend

```bash
cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor
ruff check backend/ --quiet
pytest backend/tests/ -v --tb=short
```

#### Frontend

```bash
cd /Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor/frontend
npx tsc --noEmit
npx vitest run --reporter=verbose
```

### 4. Report results

```
## Test Results

### Backend (pytest)
- PASS: X tests / FAIL: Y tests
  - [backend/tests/test_X.py:42] — test_name — AssertionError: expected 'food'

### Frontend (Vitest)
- PASS: X tests / FAIL: Y tests
  - [frontend/src/components/X.test.tsx:15] — test_name — Error: ...
```

### 5. If failures → Claude fixes → re-run

Maximum 3 loops. If still failing, report to user.
