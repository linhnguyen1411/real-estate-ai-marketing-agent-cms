#!/bin/bash
# Enable Telegram Console + Copilot on production using existing AppSetting token/chat.
set -euo pipefail
cd /var/www/real-estate-ai-cms
set -a
# shellcheck disable=SC1091
. ./.env
set +a

node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const row = await p.appSetting.findUnique({ where: { key: 'app' } });
  if (!row || !row.data || typeof row.data !== 'object') {
    throw new Error('AppSetting app row missing');
  }
  const data = { ...(row.data) };
  const chatId = String(data.telegram_chat_id || '').trim();
  if (!data.telegram_bot_token) throw new Error('telegram_bot_token missing');
  if (!chatId) throw new Error('telegram_chat_id missing');

  data.telegram_enabled = true;
  data.telegram_console_enabled = true;
  data.telegram_console_mode = data.telegram_console_mode || 'polling';
  data.telegram_allowed_chat_ids = String(data.telegram_allowed_chat_ids || chatId)
    .split(/[,;\s]+/)
    .filter(Boolean)
    .includes(chatId)
    ? String(data.telegram_allowed_chat_ids || chatId)
    : [String(data.telegram_allowed_chat_ids || '').trim(), chatId].filter(Boolean).join(',');

  await p.appSetting.update({
    where: { key: 'app' },
    data: { data },
  });
  console.log('OK settings telegram_console_enabled=true chat=' + chatId);
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
NODE

# Ensure .env console flags + allowlist chat from settings
CHAT_ID=$(node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.appSetting.findUnique({where:{key:'app'}}).then(r=>{const d=r&&r.data||{}; console.log(String(d.telegram_chat_id||'').trim()); return p.\$disconnect();})")

upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

upsert_env TELEGRAM_CONSOLE_ENABLED 1
upsert_env TELEGRAM_CONSOLE_MODE polling
upsert_env AGENT_TELEGRAM_ENABLED true
upsert_env TELEGRAM_POLL_INTERVAL_MS 2500
upsert_env TELEGRAM_EVENT_NOTIFY_MS 15000
upsert_env TELEGRAM_RATE_LIMIT_PER_MIN 20
upsert_env TELEGRAM_SUMMARY_TICK_MS 60000
if [ -n "$CHAT_ID" ]; then
  upsert_env TELEGRAM_ALLOWED_CHAT_IDS "$CHAT_ID"
fi

echo "=== ENV (masked) ==="
grep -E '^(TELEGRAM_|AGENT_TELEGRAM)' .env | sed -E 's/(TOKEN|SECRET)=.*/\1=***/'
echo "ENABLE_TELEGRAM_CONSOLE_OK"
