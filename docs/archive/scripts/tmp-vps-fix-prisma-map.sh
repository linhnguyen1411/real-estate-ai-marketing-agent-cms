#!/bin/bash
set -euo pipefail
cd /var/www/real-estate-ai-cms
# Patch schema maps on VPS (blocker fix)
python3 - <<'PY'
from pathlib import Path
p = Path('prisma/schema.prisma')
t = p.read_text()
t2 = t.replace('allowedIps      Json?\n', 'allowedIps      Json?     @map("allowed_ips")\n')
t2 = t2.replace('payloadMeta      Json?\n', 'payloadMeta      Json?    @map("payload_meta")\n')
if t2 == t:
    # already patched or different whitespace
    t2 = t.replace('allowedIps      Json?', 'allowedIps      Json?     @map("allowed_ips")')
    if 'payload_meta' not in t2:
        t2 = t2.replace('payloadMeta      Json?', 'payloadMeta      Json?    @map("payload_meta")')
p.write_text(t2)
print('schema patched')
PY
set -a
. ./.env
set +a
npx prisma generate
npx prisma validate
pm2 restart real-estate-ai-cms --update-env
sleep 4
curl -sS -m 10 http://127.0.0.1:3025/api/health
echo
echo FIX_OK
