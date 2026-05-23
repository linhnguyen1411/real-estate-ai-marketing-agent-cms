#!/usr/bin/env bash
# Chạy TRONG WSL. Cài native deps (Tailwind oxide) và gợi ý clone sang ~/ nếu /mnt/c lỗi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm install (Linux native bindings)..."
npm install

if ! node -e "require('@tailwindcss/oxide-linux-x64-gnu')" 2>/dev/null; then
  echo "==> Installing @tailwindcss/oxide-linux-x64-gnu..."
  npm install @tailwindcss/oxide-linux-x64-gnu --no-save
fi

if [[ "$ROOT" == /mnt/* ]]; then
  echo ""
  echo "⚠️  Project đang trên /mnt/c — Vite/React đôi khi lỗi trên WSL."
  echo "    Nếu npm run dev vẫn fail, copy sang Linux home:"
  echo "    cp -r \"$ROOT\" ~/workspace/real-estate-ai-marketing-agent-cms"
  echo "    cd ~/workspace/real-estate-ai-marketing-agent-cms && npm install && npm run dev"
  echo ""
fi

echo "==> npm run dev"
exec npm run dev
