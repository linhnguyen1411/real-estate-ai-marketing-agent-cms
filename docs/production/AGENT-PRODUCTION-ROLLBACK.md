# Agent Production Rollback

Date: 2026-07-13  
VPS: `root@112.213.87.124` `/var/www/real-estate-ai-cms`  
PM2: `real-estate-ai-cms`

## Fast rollback (feature flags — preferred)

```bash
cd /var/www/real-estate-ai-cms
sed -i 's/^AGENT_LOCAL_SYNC_ENABLED=.*/AGENT_LOCAL_SYNC_ENABLED=false/' .env
sed -i 's/^AGENT_TELEGRAM_ENABLED=.*/AGENT_TELEGRAM_ENABLED=false/' .env
sed -i 's/^AGENT_INGEST_ENABLED=.*/AGENT_INGEST_ENABLED=false/' .env
sed -i 's/^AGENT_SCHEDULER_ENABLED=.*/AGENT_SCHEDULER_ENABLED=false/' .env
pm2 restart real-estate-ai-cms --update-env
curl -sS http://127.0.0.1:3025/api/health
```

Also disable Settings toggles in CMS: `telegram_enabled=false`, `agent_sync_enabled=false`.

## Code rollback (keep new DB columns)

1. Restore pre-agent dist:
   ```bash
   cd /var/www/real-estate-ai-cms
   tar -xzf backups/dist-pre-agent-20260713-135015.tar.gz
   pm2 restart real-estate-ai-cms --update-env
   ```
2. Or re-upload last known-good code archive and build.
3. **Do not** drop agent tables immediately.

## Database restore (last resort)

Backup file:
`/var/www/real-estate-ai-cms/backups/pre-agent-production-20260713-135015.dump`

```bash
# STOP writes / stop app first
pm2 stop real-estate-ai-cms
set -a && . ./.env && set +a
DB_URL="${DATABASE_URL%%\?*}"
# Destructive — requires explicit confirmation
pg_restore --clean --if-exists --no-owner -d "$DB_URL" backups/pre-agent-production-20260713-135015.dump
pm2 start real-estate-ai-cms
```

Expect downtime. Verify website + CMS login after restore.

## What not to do

- Do not `prisma db push --accept-data-loss`
- Do not delete `_prisma_migrations` rows casually
- Do not drop `agent_*` tables while investigating flags-only issues
- Do not restart `timekeep-api`

## Rollback verification

- [ ] https://bdsdanang.site/api/health OK
- [ ] Public listings load
- [ ] CMS login works
- [ ] Ingest returns 503 when `AGENT_INGEST_ENABLED=false`
