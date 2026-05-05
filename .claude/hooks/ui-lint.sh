#!/bin/bash
# Triggered by PostToolUse on Write/Edit. Receives tool JSON on stdin.
# Runs ESLint on the saved .ts/.tsx file.
# Non-blocking: reports issues but does NOT block the write.
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

# Only process .ts and .tsx files
if [[ "$FILE_PATH" != *.ts ]] && [[ "$FILE_PATH" != *.tsx ]]; then
  exit 0
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  exit 0
fi

echo "--- UI lint: $FILE_PATH ---"
cd "$FRONTEND_DIR" && npx eslint "$FILE_PATH" --max-warnings=0 2>&1
echo "--- Done: $FILE_PATH ---"
exit 0
