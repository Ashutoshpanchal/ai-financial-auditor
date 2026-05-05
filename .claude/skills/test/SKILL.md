---
name: test
description: Run full test suite — pytest for backend, tsc type-check for frontend. Reports failures with file:line references.
---

# /test — Run Test Suite

Run the full test suite for the AI Financial Auditor project.

## Steps

1. **Backend tests** — run pytest with coverage
```bash
cd backend && python -m pytest tests/ -v --tb=short --no-header 2>&1
```

2. **Frontend type-check** — TypeScript strict check
```bash
cd frontend && npx tsc --noEmit 2>&1
```

3. **Report results**
- List each failure with file path and line number as a clickable markdown link
- Show pass/fail summary counts
- If all pass: confirm "All tests passing ✓"
- If failures: list them clearly, do NOT attempt to auto-fix unless user asks

## Output Format
```
## Test Results

### Backend (pytest)
- PASS: 12 tests
- FAIL: 1 test
  - [backend/tests/test_audit.py:42](backend/tests/test_audit.py#L42) — AssertionError: expected category 'food'

### Frontend (TypeScript)
- PASS: No type errors
```
