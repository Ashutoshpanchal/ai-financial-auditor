#!/bin/bash
# Triggered by Stop. Runs full test suite after every Claude response.
# Non-blocking: reports results but does NOT block the stop.
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "═══════════════════════════════════════"
echo "  Auto Test Run"
echo "═══════════════════════════════════════"

# Backend: ruff check
if command -v ruff &> /dev/null; then
  echo ""
  echo "--- Backend (ruff) ---"
  ruff check backend/ 2>&1 | tail -10
  echo "  ruff: $?"
fi

# Backend: pytest
if command -v pytest &> /dev/null && [ -d "backend/tests" ]; then
  echo ""
  echo "--- Backend (pytest) ---"
  pytest backend/tests/ -q --tb=line 2>&1 | tail -15
fi

# Frontend: tsc + vitest
if [ -f "frontend/package.json" ] && [ -d "frontend/node_modules" ]; then
  echo ""
  echo "--- Frontend (tsc) ---"
  cd frontend && npx tsc --noEmit 2>&1 | tail -5

  if [ -d "src/__tests__" ] || [ -d "tests" ]; then
    echo ""
    echo "--- Frontend (vitest) ---"
    npx vitest run --reporter=default 2>&1 | tail -15
  fi
  cd "$PROJECT_ROOT"
fi

echo ""
echo "═══════════════════════════════════════"

# Update knowledge graph so next session starts with fresh context
if command -v graphify &>/dev/null && [ -f "graphify-out/graph.json" ]; then
  echo ""
  echo "--- Graphify update ---"
  graphify update . 2>&1 | grep -E "Rebuilt|updated|nodes" | tail -3
fi

echo "═══════════════════════════════════════"
exit 0
