#!/usr/bin/env bash
# Cross-platform equivalent of test-frontend.ps1
# Usage: bash scripts/test-frontend.sh [--e2e]
set -euo pipefail

RUN_E2E=false
for arg in "$@"; do
  [ "$arg" = "--e2e" ] && RUN_E2E=true
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=()

echo "=== Frontend Tests ==="

cd "$PROJECT_ROOT/frontend"

# 1. Build check
echo ""
echo "1. Build check..."
if npm run build >/dev/null 2>&1; then
  echo "  OK: Build passed"
else
  ERRORS+=("Build failed")
  echo "  FAIL: Build failed"
fi

# 2. Lint check
echo ""
echo "2. Lint check..."
if npm run lint >/dev/null 2>&1; then
  echo "  OK: Lint passed"
else
  ERRORS+=("Lint failed")
  echo "  FAIL: Lint failed"
fi

# 3. Unit tests
echo ""
echo "3. Unit tests (Vitest)..."
if npm test -- --run >/dev/null 2>&1; then
  echo "  OK: Unit tests passed"
else
  ERRORS+=("Unit tests failed")
  echo "  FAIL: Unit tests failed"
fi

# 4. E2E tests (optional)
if [ "$RUN_E2E" = true ]; then
  echo ""
  echo "4. E2E tests (Playwright)..."
  cd "$PROJECT_ROOT"
  if npx playwright test >/dev/null 2>&1; then
    echo "  OK: E2E tests passed"
  else
    ERRORS+=("E2E tests failed")
    echo "  FAIL: E2E tests failed"
  fi
fi

# Summary
echo ""
echo "=== Summary ==="
if [ ${#ERRORS[@]} -eq 0 ]; then
  echo "OK: All frontend checks passed!"
  exit 0
else
  echo "FAIL: Errors detected:"
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
  exit 1
fi
