#!/usr/bin/env bash
# Cross-platform equivalent of setup-venv.ps1
# Usage: bash scripts/setup-venv.sh [--force] [--skip-install]
set -euo pipefail

FORCE=false
SKIP_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --force)       FORCE=true ;;
    --skip-install) SKIP_INSTALL=true ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
REQUIREMENTS_FILE="$PROJECT_ROOT/requirements.txt"

find_python() {
  for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
      version=$("$cmd" --version 2>&1)
      if echo "$version" | grep -qE "Python 3\.(1[0-9]|[2-9][0-9])"; then
        echo "$cmd"
        return 0
      fi
    fi
  done
  return 1
}

echo ""
echo "=== Python venv setup ==="
echo "Project: $PROJECT_ROOT"
echo ""

echo "[1/4] Checking Python..."
PYTHON_CMD=$(find_python) || {
  echo "  ERROR: Python 3.10+ not found on PATH."
  echo "  Install Python 3.10+ from https://www.python.org/downloads/"
  exit 1
}
PYTHON_VERSION=$("$PYTHON_CMD" --version 2>&1)
echo "  OK: $PYTHON_VERSION"

echo ""
echo "[2/4] Creating venv..."
if [ -d "$VENV_DIR" ]; then
  if [ "$FORCE" = true ]; then
    echo "  Removing existing venv: $VENV_DIR"
    rm -rf "$VENV_DIR"
  elif [ ! -f "$VENV_PYTHON" ]; then
    echo "  Existing venv looks corrupted (python missing). Recreating."
    rm -rf "$VENV_DIR"
  else
    echo "  Venv already exists: $VENV_DIR"
  fi
fi

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

if [ ! -f "$VENV_PYTHON" ]; then
  echo "  ERROR: venv python was not created: $VENV_PYTHON"
  exit 1
fi
echo "  OK: $VENV_PYTHON"

echo ""
echo "[3/4] Upgrading pip..."
"$VENV_PYTHON" -m pip install --upgrade pip -q 2>/dev/null || echo "  WARN: pip upgrade failed; continuing."
PIP_VERSION=$("$VENV_PYTHON" -m pip --version 2>&1)
echo "  OK: $PIP_VERSION"

echo ""
echo "[4/4] Installing dependencies..."
if [ "$SKIP_INSTALL" = true ]; then
  echo "  Skipped (--skip-install)."
elif [ ! -f "$REQUIREMENTS_FILE" ]; then
  echo "  WARN: requirements.txt not found: $REQUIREMENTS_FILE"
else
  "$VENV_PYTHON" -m pip install -r "$REQUIREMENTS_FILE" || {
    echo "  ERROR: pip install -r requirements.txt failed."
    exit 1
  }
  echo "  OK: requirements installed."
fi

MISSING=()
for pkg in fastapi uvicorn pytest pytest-asyncio openai pydantic; do
  if ! "$VENV_PYTHON" -m pip show "$pkg" &>/dev/null; then
    MISSING+=("$pkg")
  fi
done

echo ""
echo "========================================"
echo "Venv:   $VENV_DIR"
echo "Python: $VENV_PYTHON"

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "Status: OK"
else
  echo "Status: WARN (missing: ${MISSING[*]})"
  echo "Fix: npm run setup"
fi

echo ""
echo "Next steps:"
echo "  - npm scripts automatically use the venv"
echo "  - Verify: npm run verify:venv"
echo "  - Dev: npm run dev"
echo ""
