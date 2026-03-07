#!/usr/bin/env bash
# Cross-platform equivalent of verify-venv.ps1
# Usage: bash scripts/verify-venv.sh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
ALL_OK=true

if [ -f "$VENV_DIR/bin/python" ]; then
  PYTHON_EXE="$VENV_DIR/bin/python"
elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
  PYTHON_EXE="$VENV_DIR/Scripts/python.exe"
else
  PYTHON_EXE=""
fi

echo ""
echo "=== Python venv verification ==="
echo "Project: $PROJECT_ROOT"
echo ""

# 1. Venv exists
echo "[1/5] Checking venv existence..."
if [ -d "$VENV_DIR" ]; then
  echo "  OK: Venv found: $VENV_DIR"
else
  echo "  FAIL: Venv not found. Run: npm run setup"
  exit 1
fi

# 2. Python executable
echo ""
echo "[2/5] Checking Python executable..."
if [ -n "$PYTHON_EXE" ] && [ -f "$PYTHON_EXE" ]; then
  echo "  OK: Python found: $PYTHON_EXE"
else
  echo "  FAIL: Python not found in venv"
  ALL_OK=false
fi

# 3. Python version
echo ""
echo "[3/5] Checking Python version..."
if [ -n "$PYTHON_EXE" ]; then
  PY_VERSION=$("$PYTHON_EXE" --version 2>&1) || true
  echo "  OK: $PY_VERSION"
  if echo "$PY_VERSION" | grep -qE "Python 3\.[0-9]\b"; then
    MINOR=$(echo "$PY_VERSION" | grep -oE "3\.[0-9]+" | cut -d. -f2)
    if [ "$MINOR" -lt 10 ]; then
      echo "  WARN: Python < 3.10 (recommended: 3.10+)"
    fi
  fi
else
  echo "  FAIL: Cannot check Python version"
  ALL_OK=false
fi

# 4. pip
echo ""
echo "[4/5] Checking pip..."
if [ -n "$PYTHON_EXE" ]; then
  PIP_VERSION=$("$PYTHON_EXE" -m pip --version 2>&1) && {
    echo "  OK: $PIP_VERSION"
  } || {
    echo "  FAIL: pip not available in venv"
    ALL_OK=false
  }
else
  echo "  FAIL: Cannot check pip"
  ALL_OK=false
fi

# 5. Key dependencies
echo ""
echo "[5/5] Checking key dependencies..."
MISSING=()
for pkg in fastapi uvicorn pytest openai pydantic pytest-asyncio; do
  if [ -n "$PYTHON_EXE" ] && "$PYTHON_EXE" -m pip show "$pkg" &>/dev/null; then
    echo "  OK: $pkg installed"
  else
    echo "  FAIL: $pkg not installed"
    MISSING+=("$pkg")
    ALL_OK=false
  fi
done

# Summary
echo ""
echo "========================================"
if [ "$ALL_OK" = true ]; then
  echo "  All checks passed!"
  echo "========================================"
  echo ""
  echo "Venv is correctly configured."
  echo "Start development with: npm run dev"
  exit 0
else
  echo "  Some checks failed"
  echo "========================================"
  if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    echo "Missing packages: ${MISSING[*]}"
    echo "Install: $PYTHON_EXE -m pip install -r requirements.txt"
  fi
  echo ""
  echo "To recreate the venv: npm run setup"
  exit 1
fi
