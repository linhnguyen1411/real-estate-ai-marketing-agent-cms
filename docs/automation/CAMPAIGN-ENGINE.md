# Campaign Engine (Phase E1)

**Date:** 2026-07-17  
**Status:** Ready (multi-destination fan-out)

## Goal

Turn Publisher into a **Campaign Engine**: one campaign publishes the same draft to many destinations, each with its own job, mission, retry, evidence, and permalink.

## Architecture

```
Campaign
  └── CampaignRun
        ├── CampaignTarget → SocialPublishJob → MissionRun → AgentJob
        │                     └── Destination Adapter (timeline / group / …)
        │                     └── Evidence + permalink
        ├── CampaignTarget → …
        └── CampaignTarget → …
```

Reuses unchanged:

- Automation Engine
- Mission Runtime
- Worker Runtime / Queue
- Action Framework
- Destination Registry
- Timeline / Group adapters
- Browser Runtime (not modified)

## Entities

| Entity | Table | Role |
|--------|-------|------|
| **Campaign** | `social_campaigns` | Plan: draft + ordered `destinationChannelIds` |
| **CampaignRun** | `social_campaign_runs` | One execution; aggregate status + progress |
| **CampaignTarget** | `social_campaign_targets` | One destination in a run → one `publishJobId` |

## Execution plan

`buildCampaignExecutionPlan` / `startCampaignRun`:

1. Read campaign destinations
2. Resolve `destinationKey` per channel via Destination Registry
3. Create `CampaignRun` + `CampaignTarget` rows
4. For each target: `createPublishJob` (existing)
5. Optionally `enqueueAgentJobForPublishJob` → `startPublishMissionRun` (existing)

No duplicated publish DOM logic.

## Per-destination isolation

Each target has:

- own `status` (`pending` → `queued` → `publishing` → `published` | `failed`)
- own `publishJobId` (retries via existing job attempts)
- own `missionRunId`
- own `permalink` / `result` / `error*`

## Campaign run status

From `refreshCampaignRunProgress`:

| Status | Meaning |
|--------|---------|
| `queued` / `running` | Targets still in flight |
| `completed` | All published (or published + skipped) |
| `failed` | All failed |
| `partial_success` | Mix of published + failed |

Progress JSON: `{ total, completed, failed, pending, publishing, skipped }`

## Code map

- `server/modules/social-publishing/campaignTypes.ts` — pure helpers
- `server/modules/social-publishing/campaignService.ts` — create / start / refresh
- `prisma/schema.prisma` + migration `20260717110000_social_campaign_engine`

## Tests

```bash
npm run test:campaign-engine
npm run test:facebook-timeline
npm run test:facebook-group
npm run test:social-publishing
npm run test:mission-engine
npm run lint
```
