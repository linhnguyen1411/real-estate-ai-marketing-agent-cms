# Release v0.9.0 — Runtime Stable (H0.2)

**Tag:** `v0.9.0-runtime-stable`  
**Commit message:** `chore(release): audit system and prepare v0.9 stable`

## What's in

- G1 Stateless Execution Agent
- G1.5 Browser Ownership & Lease Manager
- G2 Intelligent Fleet Orchestrator
- H0.4 Job ownership on planner assign (`ownerMachine`, `ownerAgent`, `leaseUntil`, `plannerDecision`)
- H0 audits + roadmaps (no new product features)
- H0 publish bugfixes: evidence finalize, channel `profileUrl` hydration, Group/Timeline publish selectors + soft verify

## What's frozen

Mission Runtime · Execution/Browser Pools · Fleet/Placement engines · Telegram Runtime · Automation Engine · Schema (except bugfixes)

## Facebook publish (stable surface)

Text · single/multi image · upload retry · evidence · verification  
**Video = Experimental** (blocked by media validation)

## Ops gates (required for live publish)

| Env | Where | Value |
|-----|--------|--------|
| `BROWSER_PUBLISH_LIVE` | **VPS** (Control Plane hydrate) | `1` |
| `AGENT_BROWSER_MODE` | Execution Agent machine | `cdp` |
| `AGENT_CDP_ENDPOINT` | Execution Agent | `http://127.0.0.1:9222` |
| `AGENT_WORKER_ID` | Execution Agent | stable id (e.g. `worker-LinhMSC-vps`) |

Run **one** of `automation-agent` **or** `agent-worker` — not both (double-claim / CDP storm).

## H0.3 E2E (confirmed 2026-07-21)

- Draft `cmrsypi1x02iamd6b83qzqik9` → **published**
- SocialPublishJob `cmrtzh1et0001x8tchl2v4jqp` → **published** (Timeline)
- AgentJob `cmru1j8n50003jnrf8xhz6395` → **completed**
- Permalink present; browser lease `browser_publish_*` recorded
- Path: Scheduler → Fleet/ownership → CDP agent → Facebook Timeline → Evidence → Published

## Deploy steps

1. Backup DB / `.env` / uploads / runtime lease sidecars  
2. `npm run deploy:safe` (or approved VPS path)  
3. Ensure `BROWSER_PUBLISH_LIVE=1` on VPS; restart PM2 with `--update-env`  
4. Health: `/api/health` → scheduler enabled+running  
5. Burn-in checklist (`BURN-IN-CHECKLIST.md`)  
6. Tag `v0.9.0-runtime-stable`

## Rollback

Restore DB dump + previous `dist`/pm2 dump; unset `BROWSER_PUBLISH_LIVE` only if intentional dry-run hydrate is required.
