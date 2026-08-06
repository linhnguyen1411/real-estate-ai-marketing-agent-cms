# Architecture Status — v0.9 Runtime Stable (H0.1)

## Frozen architecture (do not change in H0)

Mission Runtime · Execution Pool · Browser Pool · Fleet · Placement Engine · Execution Agent · Telegram Runtime · Automation Engine · DB schema (except bugfix)

## Layers

```
Admin / Telegram / Copilot
        ↓
Control Plane (Fleet Orchestrator, Runtime API, Ops)
        ↓
Agent Scheduler (enqueue only)
        ↓
AgentJob queue (SKIP LOCKED)
        ↓
Placement + Job Ownership (soft assign)
        ↓
automation-agent (stateless) + Browser Lease
        ↓
Scan / Publish adapters + Evidence
```

## Maturity

| Capability | Maturity |
|------------|----------|
| Scan Facebook groups | Stable |
| Publish Timeline/Group (text + images) | Stable |
| Multi-image upload + retry | Stable |
| Publish evidence + verify | Stable |
| Video publish | Experimental |
| Fleet soft placement | Stable (G2) |
| Browser ownership/lease | Stable (G1.5) |
| Stateless execution agent | Stable (G1) |
| Campaign fan-out | Stable |
| Graph API publish | Deprecated |

## Next platform (post H0)

See `docs/roadmap/AI-MARKETING-PLATFORM.md` — H1 AI Gateway → H5 AI Sales.
