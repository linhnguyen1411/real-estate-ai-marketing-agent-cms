# System Audit — Automation Platform (H0.1)

**Date:** 2026-07-21  
**Branch:** `feature/control-plane-telegram-console`  
**Baseline commits:** G1 Stateless · G1.5 Browser Lease · G2 Fleet Orchestrator  
**Prod health:** `scheduler.enabled=true`, `aiProvider=gemini`

## Verdict

Automation Platform is **runtime-stable** for v0.9. No new product features in H0. Publish schedule path, fleet soft placement, and browser lease are wired end-to-end.

## Subsystem status

| Area | Status | Owner path |
|------|--------|------------|
| Mission Runtime | Stable | `server/modules/mission-engine/` |
| Execution Pool | Stable | `server/agent-worker/runtime/executionPool.ts` |
| Browser Pool / Lease | Stable (G1.5) | `server/agent-worker/runtime/browserPool.ts` |
| Fleet / Placement | Stable (G2) | `server/modules/control-plane/fleet-orchestrator/` |
| Agent Scheduler | Stable (env-gated) | `server/agent/agentScheduler.ts` |
| Publishing | Stable (browser DOM) | `server/modules/social-publishing/` |
| Scanner | Stable | `server/agent-worker/scanSourceHandler.ts` |
| Campaign | Stable | `campaignService.ts` |
| Telegram / Copilot | Stable | `server/modules/control-plane/telegram/` |
| Admin Runtime | Stable | `src/features/agent/runtime-monitor/` |
| Runtime API | Stable | `runtimeAgentRoutes.ts` |

## Module ownership

| Module | Owns |
|--------|------|
| `mission-engine` | Templates, runs, workflow steps |
| `social-publishing` | Drafts, jobs, campaigns, DOM destinations, evidence |
| `control-plane` | Fleet, orchestrator, Telegram, Runtime API, hydration |
| `agent-worker` | Claim, browser, scan adapters, pools |
| `automation-agent` | Stateless execution node entry |
| `agent/` | CMS scheduler, admin agent routes |
| `ai/` + `aiService.ts` | Multi-provider generation |

## Dead / deprecated (tracked, not deleted in H0)

- Graph publish flag-gated (`SOCIAL_ALLOW_GRAPH_PUBLISH`) — deprecated docs present
- `src/components/agent/*` re-export shims → features
- Legacy Facebook CMS routes gated by `FACEBOOK_GRAPH_LEGACY_ENABLED`
- Ops one-offs: `scripts/tmp-vps-*.ts`
- Naming collision: fleet `scheduler.ts` (scoring) vs CMS `agentScheduler` (enqueue)

## TODO / FIXME / HACK

Source markers: **0 TODO / 0 FIXME / 0 HACK**. Debt signal is `@deprecated` (~57) and large files (`server.ts`, `agentRoutes.ts`, `App.tsx`).

## Publish schedule E2E (contract)

```
Draft → Approved → Scheduled → SocialPublishJob
  → AGENT_SCHEDULER enqueueDueSocialPublishJobs
  → AgentJob publish_social
  → Placement + ownership payload
  → automation-agent claim
  → Browser lease
  → Facebook DOM publish
  → Evidence → Complete → Telegram/report
```

## Prod snapshot (audit time)

- Health: OK · scheduler running · Gemini configured
- `AGENT_SCHEDULER_ENABLED=true` on VPS

## H0.3 publish E2E notes

Verified on VPS after deploy:

- Scheduler enqueues `publish_social` AgentJobs for due `SocialPublishJob`
- Placement writes `ownerAgent` / `ownerMachine` / `leaseUntil` / `plannerDecision`
- **Bug fixed in H0:** stateless evidence now finalizes `SocialPublishJob` (`applyExecutionEvidence`)
- Duplicate AgentJob enqueue while one is active is blocked
- **Live publish requires** VPS `BROWSER_PUBLISH_LIVE=1` (hydrate sets `dryRun`)
- **Channel `profileUrl`** is merged into `destinationConfig` when `config` JSON is empty
- **Do not run** `agent-worker` and `automation-agent` concurrently
- **Live proof:** Timeline job `cmrtzh1et0001x8tchl2v4jqp` → draft+job **published** (permalink in result)
