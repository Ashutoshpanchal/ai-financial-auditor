#!/bin/bash
# PostToolUse hook: runs relevant tests after every Python/TypeScript file write.
# Output is fed back to Claude so it can see failures and fix them inline.
#
# Triggered by: Write or Edit tool
# Receives: JSON on stdin with "file_path" key
# Exits: always 0 (non-blocking) but prints PASS/FAIL clearly

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# --- Read file_path from stdin (tool input JSON) ---
TOOL_INPUT=$(cat)
FILE_PATH=$(echo "$TOOL_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('file_path',''))
except:
    print('')
" 2>/dev/null)

# Nothing to test if no file path
[ -z "$FILE_PATH" ] && exit 0

cd "$PROJECT_ROOT"

# ─────────────────────────────────────────────
# Python file → run pytest
# ─────────────────────────────────────────────
if echo "$FILE_PATH" | grep -qE '\.py$'; then
  # Skip test infrastructure files themselves (conftest, __init__)
  if echo "$FILE_PATH" | grep -qE '(conftest|__init__)\.py$'; then
    exit 0
  fi

  # Derive the test file to run
  if echo "$FILE_PATH" | grep -q 'backend/tests/'; then
    # File IS a test — run it directly
    TEST_TARGET="$FILE_PATH"
  else
    # Infer test file from source file path
    BASENAME=$(basename "$FILE_PATH" .py)
    TEST_TARGET=$(find backend/tests -name "test_${BASENAME}.py" 2>/dev/null | head -1)
    if [ -z "$TEST_TARGET" ]; then
      # No specific test file found — run all backend tests (fast, <2s)
      TEST_TARGET="backend/tests/"
    fi
  fi

  echo ""
  echo "┌─ pytest: $TEST_TARGET"
  OUTPUT=$(python -m pytest "$TEST_TARGET" -q --tb=short --no-header 2>&1)
  EXIT_CODE=$?
  echo "$OUTPUT" | tail -20
  if [ $EXIT_CODE -eq 0 ]; then
    echo "└─ ✓ PASS"
  else
    echo "└─ ✗ FAIL (exit $EXIT_CODE) — fix the failures above before finishing"
  fi
fi

# ─────────────────────────────────────────────
# TypeScript/TSX file → run vitest for that file
# ─────────────────────────────────────────────
if echo "$FILE_PATH" | grep -qE '\.(tsx?|test\.tsx?)$'; then
  if [ ! -d "frontend/node_modules" ]; then
    exit 0
  fi

  # Derive test file
  if echo "$FILE_PATH" | grep -q '\.test\.'; then
    TEST_TARGET="$FILE_PATH"
  else
    BASENAME=$(basename "$FILE_PATH" | sed 's/\.\(tsx\|ts\)$//')
    TEST_TARGET=$(find frontend/src -name "${BASENAME}.test.tsx" -o -name "${BASENAME}.test.ts" 2>/dev/null | head -1)
    [ -z "$TEST_TARGET" ] && exit 0
  fi

  echo ""
  echo "┌─ vitest: $TEST_TARGET"
  OUTPUT=$(cd frontend && npx vitest run "$TEST_TARGET" --reporter=verbose 2>&1)
  EXIT_CODE=$?
  echo "$OUTPUT" | tail -20
  if [ $EXIT_CODE -eq 0 ]; then
    echo "└─ ✓ PASS"
  else
    echo "└─ ✗ FAIL (exit $EXIT_CODE) — fix the failures above before finishing"
  fi
fi

exit 0
