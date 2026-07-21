# Release v0.9.0 — Runtime Stable (H0.2)

**Tag:** `v0.9.0-runtime-stable`  
**Commit message:** `chore(release): audit system and prepare v0.9 stable`

## What's in

- G1 Stateless Execution Agent
- G1.5 Browser Ownership & Lease Manager
- G2 Intelligent Fleet Orchestrator
- H0.4 Job ownership on planner assign (`ownerMachine`, `ownerAgent`, `leaseUntil`, `plannerDecision`)
- H0 audits + roadmaps (no new product features)

## What's frozen

Mission Runtime · Execution/Browser Pools · Fleet/Placement engines · Telegram Runtime · Automation Engine · Schema (except bugfixes)

## Facebook publish (stable surface)

Text · single/multi image · upload retry · evidence · verification  
**Video = Experimental** (blocked by media validation)

## Deploy steps

1. Backup DB / `.env` / uploads / runtime lease sidecars  
2. `npm run deploy:safe` (or approved VPS path)  
3. Health: `/api/health` → scheduler enabled+running  
4. Burn-in checklist (`BURN-IN-CHECKLIST.md`)  
5. Tag `v0.9.0-runtime-stable`

## Rollback

Restore DB dump + previous `dist`/pm2 dump; unset new env only if required (none required for H0 ownership — payload-only).
