# Agent Production Pre-Deploy Audit

Date: 2026-07-13  
Branch (local): `feature/ai-employee-platform`  
Local commit at audit: `ea315cd` (+ large uncommitted working tree with agent pipeline)  
Production: https://bdsdanang.site  
VPS: `root@112.213.87.124` → `/var/www/real-estate-ai-cms`

---

## PHẦN 1 answers

| # | Item | Finding |
|---|------|---------|
| 1 | VPS commit/branch | **Not a git checkout.** Deployed via tar (`scripts/deploy.ps1`). App code dated ~2026-06-30 / PM2 created 2026-07-10. No agent platform code on disk. |
| 2 | Node | **v20.19.5** (PM2 interpreter) |
| 3 | Prisma (VPS `node_modules`) | **5.22.0** (matches local). Global `npx prisma` can show 7.x — do **not** use global for migrate. |
| 4 | PostgreSQL | **14.19** (Ubuntu) |
| 5 | DATABASE_URL | host=`localhost:5432`, db=`real_estate_ai`, user=`real_estate_ai` (password not logged) |
| 6 | PM2 process | **`real-estate-ai-cms`** (id 82, fork, script `scripts/start-production.cjs`, PORT **3025**). Also `timekeep-api` — do not touch. |
| 7 | Prisma migrations applied | **None.** Table `_prisma_migrations` **does not exist**. |
| 8 | Manual SQL migrations | Historical schema via **`prisma db push`** (see `scripts/deploy.ps1` line with `--accept-data-loss`). Agent tables never pushed. |
| 9 | Agent tables on VPS? | **No.** Only CMS/Facebook/Lead tables exist. `agent_*`, `scanned_contents`, `external_inventory_*`, ingest/telegram tables: **absent**. |
| 10 | Feature flags prod | **No `AGENT_*` vars** in VPS `.env`. Only `PORT/HOST/APP_URL`. |
| 11 | Ingestion API mounted? | **No** (old code). |
| 12 | Telegram service mounted? | **No** (old code). |
| 13 | Local worker sync | Local AppSettings `agent_sync_enabled` default off; VPS N/A. |
| 14 | Rollback code | Re-upload previous `dist-*.tar.gz` from `/var/www/real-estate-ai-cms/backups` + `pm2 restart`; or restore SQL backup. |
| 15 | Backup script | `scripts/backup-prod.ps1` → remote `pg_dump` plain SQL + optional dist/env copy. Also `scripts/remote-backup.sh`. |

### Public tables currently on VPS

`authors`, blog_*, `categories`, `chat_history`, `cms_records`, `companies`, facebook_*, `generated_contents`, lead_*, `leads`, `public_chat_guests`, `settings`, short_link_*, `tags`, `users`

### Critical risks before deploy

1. **`scripts/deploy.ps1` MUST NOT be used as-is** — it runs `npx prisma db push --accept-data-loss` (forbidden).
2. First agent deploy will create **many new tables** via `prisma migrate deploy` (greenfield for agent schema). Additive only; migrations contain **no DROP/TRUNCATE/ALTER TYPE**.
3. Local working tree has the verification target code **uncommitted** — deploy must package working tree (tar) or commit first.
4. Env feature flags `AGENT_INGEST_ENABLED` / `AGENT_TELEGRAM_ENABLED` / `AGENT_LOCAL_SYNC_ENABLED` are **not yet wired** as hard gates (Telegram/sync use AppSettings; ingest always registers). Staged rollout needs minimal env gates before production enablement.

### Staged rollout plan (post-backup)

**A:** Deploy code + migrate; `AGENT_INGEST_ENABLED=true`; Telegram settings off; scheduler off; no local sync.  
**B:** Enable Telegram after ingest tests.  
**C:** Enable local sync after Telegram tests.  
Never enable `AGENT_SCHEDULER_ENABLED` on VPS (no browser scan on VPS).

### Decision after audit

Proceed to **PHẦN 2 Backup**, then migration baseline + **safe deploy** (migrate deploy only).  
Do **not** run stock `deploy.ps1`.
