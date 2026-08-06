# Agent Production Verification Report

Date: 2026-07-13  
Production: https://bdsdanang.site  
Decision: **PASS WITH LIMITATIONS**

---

## 1. VPS environment

| Item | Value |
|------|-------|
| Host | 112.213.87.124 (`cloudvps87124.superdata.vn`) |
| App dir | `/var/www/real-estate-ai-cms` |
| PM2 | `real-estate-ai-cms` (PORT 3025) |
| Node | v20.19.5 |
| Prisma (app) | 5.22.0 |
| PostgreSQL | 14.19 |
| DB | `real_estate_ai` @ localhost:5432 |
| Scheduler | disabled |

## 2. Git / code

- Local branch: `feature/ai-employee-platform` (working tree deployed via safe tar; not a clean tagged release)
- VPS is not a git checkout
- Safe deploy path: `scripts/deploy-safe.ps1` + remote bash ( **never** stock `deploy.ps1` / `db push --accept-data-loss`)

## 3. Backup

| File | Notes |
|------|-------|
| `/var/www/real-estate-ai-cms/backups/pre-agent-production-20260713-135015.dump` | custom format, **21MB**, `pg_restore --list` = 180 lines |
| `...meta.txt` / `...list.txt` | present |
| `dist-pre-agent-20260713-135015.tar.gz` | code rollback artifact |
| `env-pre-agent-*.bak` | env snapshot (not committed) |

## 4–5. Migration baseline + deploy

| Migration | Result |
|-----------|--------|
| `20260630000000_baseline_existing_cms` | resolve --applied (no-op; existing CMS schema) |
| `20260710103000` … `20260713050000` | **applied successfully** via `migrate deploy` |
| Status | Database schema is up to date (6 migrations) |

Agent tables verified present: `agent_sources`, `agent_findings`, `scanned_contents`, `external_inventory_items`, `agent_api_credentials`, `agent_ingestion_events`, `agent_sync_outbox`, `telegram_delivery_logs`, `_prisma_migrations`.

See `docs/production/AGENT-MIGRATION-BASELINE.md`.

## 6. Feature flags (Stage A live)

```
AGENT_INGEST_ENABLED=true
AGENT_TELEGRAM_ENABLED=false
AGENT_LOCAL_SYNC_ENABLED=false
AGENT_SCHEDULER_ENABLED=false
FACEBOOK_GRAPH_LEGACY_ENABLED=true  # webhook tables exist; do not disable
```

## 7. API credential

| Field | Value |
|-------|-------|
| keyId | `ak_b507e11250994dd5` |
| company | `comp-da-nang` |
| scopes | findings:ingest, contents:ingest |
| secret storage | `/root/.agent-ingest-secret` mode 600 on VPS only |
| encrypted_secret | set (AES via AUTH_SECRET/FB key) |

Raw secret **not** in git.

## 8–9. Ingestion + idempotency tests (Stage A)

Script: `scripts/tmp-vps-ingest-verify.cjs` on VPS.

| Test | Result |
|------|--------|
| A valid ingest | **PASS** — Finding + ScannedContent created; telegramQueued not true |
| B same idempotency key | **PASS** — duplicate/same findingId; one DB row |
| C bad signature | **PASS** — 401 |
| D expired timestamp | **PASS** — 401 |
| E nonce replay | **PASS** — 401 |
| H sparse payload | **WARN** — soft validation accepts (document; not hard reject) |
| Health HMAC | **PASS** — ingestEnabled true, telegramEnabled false, dbReady |

Example IDs from last run:
- findingId `cmrivqjo4000rtrurv547m3eg`
- scannedContentId `cmrivqjnl000ptrur05kpojyx`

## 10. Telegram tests

**Not executed (blocked on credentials).**  
`AGENT_TELEGRAM_ENABLED=false`. No bot token/chat id configured in production settings during this phase.

Next: configure Settings → Telegram → Test message → set `AGENT_TELEGRAM_ENABLED=true` → restart → new ingestionId.

## 11–12. Local sync / outbox

**Not executed.**  
`AGENT_LOCAL_SYNC_ENABLED=false`. Requires local Settings (VPS URL, key id, secret) + Test Connection after Stage B.

## 13–14. Buyer / Supply full Facebook pipelines

**Not executed.**  
No live FB scan → VPS promote/CRM/external convert in this session (prompt forbids large FB scans on first verification pass). Manual CMS promote/convert remains available once Findings exist.

## 15–16. Queue / dedupe

Ingest idempotency proven (B). Full Finding→Lead→CRM / External→Official retry matrices still **pending** manual UI pass.

## 17. Security checks

| Check | Result |
|-------|--------|
| HMAC valid | PASS |
| Bad signature | PASS |
| Timestamp skew | PASS |
| Nonce replay | PASS |
| Telegram/env off | PASS |
| Secret masking in settings API | implemented (code) |
| Revoke credential / tenant isolation / rate limit | **not fully exercised** |
| Graph legacy left enabled | intentional |

### Blockers fixed during verification

1. P3005 non-empty DB → baseline migration + resolve  
2. `allowedIps` / `payloadMeta` missing `@map` → schema fix + regenerate  
3. Credential must store `encrypted_secret` (hash alone cannot HMAC)  
4. GET health body `{}` vs `""` hash mismatch → treat empty object as empty body  
5. `telegramQueued=true` optimistic bug → only mark when send ok  
6. Stock `deploy.ps1` forbidden → `deploy-safe.ps1`

## 18. Monitoring snapshot

- PM2 online after restart; health OK on :3025 and public `/api/health`
- Heap ~130–200MB during checks
- No agent browser worker on VPS (correct)

## 19. Unverified / next steps

1. Configure Telegram bot + chat; Stage B enable + test  
2. Local PC sync Test Connection; Stage C enable; outbox offline/retry  
3. One real buyer + one real seller end-to-end UI pipeline  
4. Credential revoke test; member RBAC; company isolation  
5. Commit working tree / tag release for reproducible deploys  
6. Tighten sparse payload validation (WARN H)

## 20. Production readiness decision

### **PASS WITH LIMITATIONS**

**Ready now:**
- Production DB migrated safely (with backup)
- Agent CMS code live under Stage A flags
- Secure ingest API accepting signed traffic
- Idempotency + replay protections proven
- Rollback docs + backup available

**Not ready to claim full PASS:**
- Telegram not verified
- Local→VPS outbox not verified
- Full buyer/seller operational pipelines not manually completed

Do **not** enable Telegram or local sync until those tests pass.
