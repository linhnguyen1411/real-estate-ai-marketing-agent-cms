#!/usr/bin/env bash
# Dev trên WSL: dùng Ollama cài trên Windows (không cần `ollama` trong PATH Linux).
set -euo pipefail

OLLAMA_WIN="/mnt/c/Users/linhn/AppData/Local/Programs/Ollama/ollama.exe"

if [[ ! -x "$OLLAMA_WIN" ]]; then
  echo "Không tìm thấy Ollama Windows tại: $OLLAMA_WIN"
  echo "Cài Ollama từ https://ollama.com rồi chạy lại script."
  exit 1
fi

# Alias cho session hiện tại
alias ollama="$OLLAMA_WIN"
export PATH="$(dirname "$OLLAMA_WIN"):$PATH"

echo "=== Ollama (Windows) ==="
"$OLLAMA_WIN" --version
"$OLLAMA_WIN" list

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -d node_modules ]]; then
  echo "=== npm install ==="
  npm install
fi

echo ""
echo "Đã sẵn sàng. Tiếp theo:"
echo "  ollama pull qwen2.5    # nếu chưa có model"
echo "  npm run dev"
echo "  Mở http://localhost:3000 → Settings → Ollama"
echo "  Endpoint: http://localhost:11434  Model: qwen2.5"
