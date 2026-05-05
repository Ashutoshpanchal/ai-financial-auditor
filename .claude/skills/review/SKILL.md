---
name: review
description: Code review of current branch diff vs main. Spawns a review subagent that checks for correctness, security, coding rules, and spec alignment.
---

# /review — Code Review

Spawn a focused code review of changes on the current branch.

## Steps

1. **Get the diff**
```bash
git diff main...HEAD --stat
git diff main...HEAD
```

2. **Spawn review subagent** with this prompt:
```
Review the following git diff for the AI Financial Auditor project (FastAPI + LangChain + React).

Check for:
1. Correctness — does the code do what it claims?
2. Security — SQL injection, auth bypass, hardcoded secrets, XSS
3. Coding rules violations:
   - Missing type hints on Python functions
   - Silent exception handling (bare except / pass)
   - Missing docstrings on Python functions
   - Hardcoded values that should be in .env / config.py
4. Spec alignment — does this match the design in docs/superpowers/specs/2026-05-05-ai-financial-auditor-design.md?
5. Performance — N+1 queries, missing indexes, unnecessary LLM calls

Format each issue as:
- [file:line](file#Lline) — **[SEVERITY: HIGH/MED/LOW]** description

[DIFF CONTENT HERE]
```

3. **Present findings** grouped by severity (HIGH → MED → LOW)

4. **Summary line:** "X issues found (Y high, Z medium, W low)"
