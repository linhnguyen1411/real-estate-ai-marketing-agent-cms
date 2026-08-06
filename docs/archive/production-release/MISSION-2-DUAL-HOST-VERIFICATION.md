# Mission 2.0 — Dual-Host Verification Report

**Date:** 2026-07-16  
**Session:** `m2dh_1784165884719`  
**Local branch:** `feature/mission-workflow-engine`  
**Local HEAD at verify:** includes deploy archive through `10250fe` / health capability `b96d8db`  
**Verdict:** **MISSION 2.0 COMPLETE** (dual-host proven; see limitations)

---

## 1. Local / VPS environment

### Local PC
| Item | Value |
|------|-------|
| CMS | PID **31712**, home **200** (unchanged; not restarted for deploy) |
| Worker | PID **5916**, `worker-LinhMSC-28556`, claiming jobs |
| BrowserSession | ready, heartbeat fresh |
| Sync | `AGENT_LOCAL_SYNC_ENABLED=true` → `https://bdsdanang.site/` |
| Tenant | `comp-da-nang` |
| Outbox pending/failed | **0** |
| stale/orphan jobs | **0** |

### VPS
| Item | Value |
|------|-------|
| Host | `bdsdanang.site` / `112.213.87.124` |
| PM2 | `real-estate-ai-cms` **online**, PID **1240500** (post-deploy) |
| `/api/health` | **200** |
| Ingest | `AGENT_INGEST_ENABLED=true`, healthy |
| Mission engine | **present** after deploy |
| Migration | `20260715150000_mission_workflow_engine` **applied** |
| missionProvenance health | `supported: true` |

---

## 2. Commits (local → archive deploy)

| Commit | Note |
|--------|------|
| `1ea202b` … `10250fe` | Mission 2.0 + health capability + preflight docs/scripts |
| Deploy | `scripts/deploy-safe.ps1 -SkipBackup` after custom dump |

---

## 3. Backup / deploy

| Step | Result |
|------|--------|
| Custom `pg_dump --format=custom` | `/var/www/real-estate-ai-cms/backups/db-20260716-083233.dump` (21MB) |
| `pg_restore --list` | TOC OK (339 entries) |
| `prisma migrate deploy` | Applied `20260715150000_mission_workflow_engine` |
| Build | success (`dist/server.cjs`) |
| PM2 restart | online, HEALTH_OK |
| db push | **not used** |

---

## 4. Credential / HMAC

| Test | Result |
|------|--------|
| Valid signature | **PASS** |
| Bad signature | **PASS** (reject) |
| Expired timestamp | **PASS** (reject) |
| Replay nonce | **PASS** (reject) |
| Tenant | `comp-da-nang` |
| Secrets | not logged |

---

## 5. Buyer dual-host

| Field | ID / proof |
|-------|------------|
| verificationSessionId | `m2dh_1784165884719` |
| Mission | `cmrmuavyg0000hhyt8sfrj6c3` `[VERIFY] Buyer Hunter Dual Host` |
| MissionRun | `cmrmuavym0004hhytpedqy9fh` |
| Remote content | `cmrmubxbr0037le0h0hq11sz3` |
| Remote Finding | **`cmrmuc80x003mle0hig5nygka`** |
| Classification | `buyer` |
| Warning | `mission_workflow_continued_on_vps` |
| Retry | duplicate / same resource (**PASS**) |
| Steps (9) | collect(local) → spam → extract → classify → enrich → finding → matching → notify_cms → telegram |

---

## 6. Supply dual-host

| Field | ID / proof |
|-------|------------|
| Mission | `cmrmuavyj0001hhyt1ot4svei` |
| MissionRun | `cmrmuavyq0006hhytg9rq8jn8` |
| Remote content | `cmrmucbl60041le0ht0lxe2tj` |
| External Inventory | **`cmrmucbpi004fle0hrcsajr20`** |
| Finding count | **0** |
| Steps | 8 |
| Retry | **PASS** |

---

## 7. Brand Monitoring gate (critical)

| Field | Result |
|-------|--------|
| Mission | `cmrmuavyl0002hhytvs82pv20` |
| MissionRun | `cmrmuavyr0008hhytxv2l32op` |
| Remote content | `cmrmucepy0052le0hxjiafg4a` |
| **AgentFinding count** | **0** |
| **ExternalInventory count** | **0** |
| Steps | collect → spam → topic → sentiment → summarize → telegram(**skipped**) |
| Retry | **PASS** |

---

## 8. ID mapping

See `runtime/dual-host-report-m2dh_1784165884719.json`.

---

## 9. Step execution targets

- Local completed `collect_source` synced into VPS StepRun (`status=completed`) and **not re-executed** as VPS content workflow step.
- VPS-target steps (`extract`, `classify`, `create_lead_intelligence`, inventory, notify, …) ran on VPS (`mission_workflow_continued_on_vps`).

---

## 10. Idempotency (over network)

Same idempotency key re-POST for all three cases → duplicate/same resource; Finding/Inventory counts stable.

---

## 11. Offline retry

**Not exercised against live VPS downtime** (production online; intentional outage avoided).  
Covered instead by: outbox historically syncing (2714+ synced, 0 pending/failed) + network idempotent retry. Documented as residual risk if endpoint hard-down mid-flight.

---

## 12. Recovery

Local worker/CMS not restarted during verify. VPS PM2 restart during deploy recovered healthy; post-deploy dual-host flows completed without duplicate resources.

Controlled mid-step VPS crash injection: **not run** (production risk).

---

## 13. Timeline UI

- API detail/steps available on VPS after deploy (`mission-runs` routes shipped).
- Verification Missions created **paused** + manual schedule.
- Browser walkthrough of VPS CMS UI: **not screenshot-verified** this session; API/DB timelines confirmed.

---

## 14. Telegram

- Buyer `notify_telegram` StepRun **completed**.
- Brand telegram **skipped** (no Finding-style message).
- Table `agent_telegram_deliveries` **absent** on VPS → delivery row audit not available; chat send depends on VPS bot settings (not fully audited).

---

## 15. Cleanup

- VERIFY Missions status: **paused**, schedule **manual**.
- Content/sources labeled `verification=true` / `[VERIFY]` / session id.
- Do not hard-delete provenance rows; archive/pause only.
- Probe leftovers from preflight (`dualhost_probe_*`) remain labeled.

---

## 16. Tests

| Command | Result |
|---------|--------|
| `test:mission-engine` | 12/12 PASS |
| `test:mission-provenance-e2e` | 10/10 PASS |
| Dual-host script | Buyer/Supply/Brand **all PASS** |
| lint (pre-deploy) | PASS |
| Local/VPS home | 200 / 200 |

---

## 17. Limitations

1. Offline VPS outage simulation skipped (production).
2. Telegram delivery table missing — chat-level dedupe not fully audited.
3. Timeline UI browser QA not captured.
4. Dual-host path used labeled fixture + HMAC events (real network), not a live Facebook mass scan.
5. Local open MissionRuns backlog (pre-existing) separate from VERIFY set.

---

## 18. Verdict

**MISSION 2.0 COMPLETE**

Dual-host proven: Local → HTTPS/HMAC → VPS MissionRun/StepRun → Buyer Finding + Supply Inventory + Brand **0 Finding**, with idempotent retry and Mission provenance fields preserved.
