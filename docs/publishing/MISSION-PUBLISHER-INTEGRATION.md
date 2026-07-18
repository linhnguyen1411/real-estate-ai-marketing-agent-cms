# Mission Publisher Integration

**Updated:** 2026-07-16 (Foundation Phase A+B complete)

---

## Status

| Component | Status |
|-----------|--------|
| Template `publish-browser-content` | **Registered** in `MISSION_WORKFLOW_TEMPLATES` |
| Pipeline `PUBLISH_BROWSER_CONTENT_PIPELINE` | **8 steps**, all `local_worker` |
| Step handlers | **Registered** (stub, no DOM) |
| `executePublishWorkflow()` | **Implemented** |
| `startPublishMissionRun()` | **Implemented** |
| Worker `publishSocialHandler` wire | Pending Phase C |
| Scheduler / queue auto-bridge | Pending Phase C |

---

## Template: `publish-browser-content`

```
Prepare Browser      (browser_prepare)
  ↓
Navigate             (browser_navigate + ensureAuthenticated)
  ↓
Upload               (browser_upload_media)
  ↓
Fill Content         (browser_fill_content)
  ↓
Publish              (browser_publish)
  ↓
Verify               (browser_verify_publish)
  ↓
Capture Evidence     (browser_capture_evidence)
  ↓
Cleanup              (browser_cleanup)
```

File: `server/modules/mission-engine/domain/publishMissionTemplate.ts`

---

## Bridge: Queue → MissionRun

```ts
import { startPublishMissionRun } from 'server/modules/social-publishing/publishMissionBridge';

const { missionRunId, agentJobId, created } = await startPublishMissionRun({
  publishJobId: job.id,
  companyId: job.companyId,
  triggeredBy: 'user@example.com',
  triggerType: 'api',
});
```

1. Loads `SocialPublishJob` + draft + destination
2. `findOrCreatePublishMission(companyId)` — system mission with `templateKey: publish-browser-content`
3. `createMissionRun` with pipeline snapshot
4. Stores `missionRunId` on job `result` JSON
5. Creates `AgentJob` type `publish_social` with `{ publishJobId, missionRunId }`

Idempotent: reuses active run + agent job if not terminal.

---

## Worker execution (Phase C wire)

```ts
import { executePublishWorkflow } from 'server/modules/mission-engine/application/publishWorkflowExecutionService';

await executePublishWorkflow({
  missionRunId,
  publishJobId,
  jobId: agentJob.id,
  workerId,
  browserSessionId,
  runtimeTarget: 'local_worker',
});
```

Steps delegate to `BrowserDestinationAdapter` via registry — **not** Graph API.

---

## Context extension

`WorkflowStepContext` extended with optional:

- `publishJobId`
- `destinationKey`

Publish payload cached under `previousStepOutputs.__publish__` after prepare step.

---

## Dual-host

Publish workflow: **local_worker only**. VPS does not execute browser steps.

Scan/collect missions unchanged.

---

## AI / Draft policy

`createMissionSocialDraft` → `pending_review` only. No auto-approve. Unchanged.

---

## Tests

```bash
npm run test:browser-publisher-foundation
```

Validates template registration, handler registration, bridge exports.
