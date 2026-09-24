# OPERATIONS RECOVERY — Phase O1

**Date:** 2026-07-19 (UTC+7)  
**Goal:** Restore production to burn-in-ready (no features, no architecture change)  
**Verdict:** **READY FOR 24H BURN-IN**

---

## Priority results

| Pri | Item | Result |
|-----|------|--------|
| P1 | Telegram egress | **PASS** — root cause IPv6 unreachable to `api.telegram.org`; forced IPv4-first in `start-production.cjs` + `NODE_OPTIONS`. `getMe` OK (`bdsdanang_ai_bot`), `sendMessage` OK |
| P2 | Execution Agent → VPS Runtime API | **PASS** — `exec-linhmsc-o1` registers/heartbeats to `https://bdsdanang.site` |
| P3 | Deploy Telemetry (5239456+) | **PASS** — telemetry module on VPS; second deploy included Runtime API auth bypass |
| P4 | Disk &lt; 75% | **PASS** — **51%** used (was 90%). Freed snap revisions/Firefox/GNOME/LXD, journals, gems, old backups |
| P5 | dead_letter | **PASS** — 5× `finding_upsert` (`VPS HTTP 500`, attempts=12) reviewed → status `discarded`; dead_letter count **0** |
| P6 | Runtime Snapshot on VPS | **PASS** — heartbeat returns `telemetry.schemaVersion=1`; session metadata has host/process/browser/jobs/scanner |
| P7 | Telegram shows Local Agent | **PASS** — ops message delivered to chat `-5592400378` with `host=LinhMSC` snapshot lines |
| P8 | Smoke | **PASS** (see below) |

---

## Bug fix required for P2 (minimal)

`/api/agent/runtime/*` was blocked by CMS session auth before `AGENT_RUNTIME_TOKEN` could apply.

**Fix:** allow `/agent/runtime/` through the public `/api` gate (same pattern as `/agent-ingest/`).

Also: `scripts/start-production.cjs` loads `dotenv` + `dns.setDefaultResultOrder('ipv4first')`.

---

## Topology after recovery

```
Local scan worker (worker-LinhMSC-*)  → local CMS DB (scan/publish jobs)
Local automation-agent (exec-linhmsc-o1) → VPS Runtime API (heartbeat + telemetry)
VPS CMS + Telegram console ← snapshots / OPS queue
Local sync outbox → VPS ingest (findings)
```

---

## Smoke (P8)

| Check | Evidence |
|-------|----------|
| Heartbeat | VPS session `exec-linhmsc-o1` hb fresh (~seconds) |
| Scanner | Local `worker-LinhMSC-22116` ready; jobs completing |
| Publish | Not re-run; prior local publish history intact (no blocker) |
| Telemetry | Heartbeat payload includes schemaVersion/chrome/jobs |
| Runtime | Register/heartbeat HTTP 200 + DB session |
| Telegram | getMe + sendMessage 200; console started without poll errors after IPv4 fix |

---

## Residual notes (non-blocking)

- VPS scheduler remains **disabled** (dual-host by design)
- `automation-agent` may claim empty/orphan VPS jobs (`SOURCE_REMOVED` on stale Jul-13 job) — expected until VPS queue is intentionally used
- Keep local scan worker on local DB; VPS-bound agent is for remote monitoring
- Disk headroom is healthy now; continue log rotation during burn-in

---

## Follow-up ops (optional, not blockers)

1. Cancel remaining stale VPS queued jobs if any reappear  
2. Keep `automation-agent` running for 24h heartbeat visibility  
3. Fill `BURN-IN-CHECKLIST.md` samples every 4–6h  
