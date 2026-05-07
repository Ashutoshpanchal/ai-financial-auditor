#!/bin/bash
# SessionStart hook: refresh the graphify knowledge graph and inject the
# GRAPH_REPORT summary into Claude's context so it uses the graph as its
# primary codebase reference instead of reading source files directly.

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v graphify &>/dev/null; then
  exit 0
fi

# Rebuild the graph (fast, no LLM needed)
if [ -f graphify-out/graph.json ]; then
  graphify update . >/dev/null 2>&1
else
  echo "  no graph.json — run /graphify to build the initial graph" >&2
  exit 0
fi

# Inject the graph report into Claude's context
REPORT="graphify-out/GRAPH_REPORT.md"
[ -f "$REPORT" ] || exit 0

REPORT_CONTENT=$(cat "$REPORT")

python3 - "$REPORT_CONTENT" <<'PYEOF'
import json, sys

report = open("graphify-out/GRAPH_REPORT.md").read()

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": (
            "## Codebase Knowledge Graph\n\n"
            "IMPORTANT: Use graphify-out/ as your primary codebase reference. "
            "Before reading any source file, check this graph for node relationships, "
            "god-nodes, and surprising connections. Only read actual files when the "
            "graph context is insufficient.\n\n"
            + report
        )
    }
}))
PYEOF
