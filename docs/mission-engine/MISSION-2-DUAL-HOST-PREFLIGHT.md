# Mission 2.0 — Dual-Host Preflight

**Date:** 2026-07-16  
**Branch:** `feature/mission-workflow-engine`  
**Local commit:** `1ea202b` (+ health capability patch pending deploy)  
**Verification session:** to be assigned at run start

## Statement

Preflight confirms Local → VPS HTTPS/HMAC works, but **VPS is not Mission 2.0 compatible yet**. Dual-host COMPLETE verification is blocked until safe deploy of Mission 2.0 migrations + engine.

---

## 1. Local PC

| Check | Result |
|-------|--------|
| Branch | `feature/mission-workflow-engine` |
| Commit | `1ea202b` (docs close) + local health capability patch |
| CMS | PID **31712**, home **200**, up ~16h+ |
| Worker | PID **5916**, `worker-LinhMSC-28556`, managed/headless |
| BrowserSession | `cmrlubcal00002avnr9c4qn33` **ready**, heartbeat fresh |
| Sync enabled | `AGENT_LOCAL_SYNC_ENABLED=true`, settings `agent_sync_enabled=true` |
| VPS URL | `https://bdsdanang.site/` |
| API key ID | present (masked `ak_b…4dd5`) |
| companyId | `comp-da-nang` |
| TLS verify | true |
| Outbox | ~2714 synced; 0–1 sending; **0 pending/failed abnormal** |
| Open MissionRuns | **21** (local settle backlog — non-blocker for dual-host) |
| Mission migration | `20260715150000_mission_workflow_engine` **present** (9 migrations, schema up to date) |
| Local ingest | `AGENT_INGEST_ENABLED=false` (local is sender, expected) |

Secrets not printed.

---

## 2. VPS (`bdsdanang.site` / `112.213.87.124`)

| Check | Result |
|-------|--------|
| Deploy method | Archive extract (no git repo on host) |
| PM2 | `real-estate-ai-cms` **online**, PID **1226878**, uptime ~18h |
| Health `/api/health` | **200** — scheduler disabled, DB postgresql |
| Ingest `/api/agent-ingest/v1/health` | HMAC OK, `healthy=true`, `ingestEnabled=true`, tenant=`comp-da-nang` |
| Telegram | health reports `telegramEnabled=true` |
| Migrations on disk | **8** — last `20260715090000_agent_spam_rules` |
| Mission migration | **MISSING** (`20260715150000_mission_workflow_engine` not on VPS) |
| Mission engine code | **NO_MISSION_ENGINE** (`server/modules` absent) |
| missionProvenance capability | **absent** from health payload |
| Schema status | `Database schema is up to date` **relative to VPS's 8 migrations only** |

---

## 3. Credential / HMAC probe

| Test | Result |
|------|--------|
| Valid signature → health | **PASS** |
| Tenant | `comp-da-nang` matches local |
| Content probe with mission fields | **accepted**, `findingId=null` (no accidental Finding) |
| Mission workflow continue warning | **absent** → VPS ignored provenance (pre-Mission-2.0 ingest) |
| HTTPS home | **200** |

---

## 4. Stop conditions (from prompt)

| Condition | Status |
|-----------|--------|
| Local/VPS schema incompatible | **YES — blocker** (VPS missing Mission 2.0 migration) |
| API credential invalid | No |
| Tenant mismatch | No |
| HTTPS error | No |
| Backup VPS | Required before deploy |
| Deployed VPS understands mission provenance | **NO — blocker** |

---

## 5. Required next step

1. Backup PostgreSQL (custom format) + `pg_restore --list`.
2. Safe deploy via `scripts/deploy-safe.ps1` (migrate deploy only, no db push).
3. Confirm health returns `missionProvenance.supported=true`.
4. Confirm migration `20260715150000_mission_workflow_engine` applied.
5. Resume Buyer / Supply / Brand dual-host gates.

## 6. Risks

- VPS production online — deploy restarts PM2 briefly.
- Open MissionRuns=21 on local — settle separately; do not confuse with verification Missions.
- Probe left a labeled `[VERIFY]` source/content on VPS (`dualhost_probe_*`) — cleanup after session.
