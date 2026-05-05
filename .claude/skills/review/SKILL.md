---
name: review
description: Code review of current branch diff with parallel lint + review subagents. Checks ruff, pyright, ESLint, tsc, correctness, security, coding rules, and spec alignment.
---

# /review — Code Review with Lint

Performs a **parallel** lint + code review of changes on the current branch.

## When to Use

- After writing code, before claiming completion
- When user types `/review`
- As part of `/quality` workflow

## Steps

### 1. Get the diff

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

### 2. Dispatch 2 subagents in parallel

#### Subagent A — Lint Agent

```
You are a linting subagent for the AI Financial Auditor project.

Run these checks on CHANGED files only (from git diff):

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

#### Subagent B — Review Agent

```
You are a code review subagent for the AI Financial Auditor project (FastAPI + LangChain + React).

Review the git diff for:

1. Correctness — does the code do what it claims?
2. Security — SQL injection, auth bypass, hardcoded secrets, XSS
3. Coding rules:
   - Missing type hints on Python functions
   - Silent exception handling (bare except / pass)
   - Missing docstrings on Python functions
   - Hardcoded values that should be in .env / config.py
   - One responsibility per function
4. Spec alignment — docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md
5. Performance — N+1 queries, missing indexes, unnecessary LLM calls

Format each issue as:
- [file:line](file#Lline) — **[SEVERITY: HIGH/MED/LOW]** description

Summary: X issues (Y high, Z medium, W low)
```

### 3. Present findings grouped by severity

```
## Review Results

### Lint
- Backend: X issues
- Frontend: Y issues

### Code Review
#### HIGH (must fix)
- [file:line] — description

#### MEDIUM (should fix)
- [file:line] — description

#### LOW (nice to have)
- [file:line] — description

Total: X issues (Y high, Z medium, W low)
```

### 4. Claude fixes all HIGH and MEDIUM issues, then re-runs review

Loop until 0 HIGH/MEDIUM issues remain.
