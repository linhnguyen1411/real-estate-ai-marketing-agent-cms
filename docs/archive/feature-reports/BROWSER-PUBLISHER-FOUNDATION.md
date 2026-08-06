# Browser Publisher Foundation

**Date:** 2026-07-16  
**Phase:** A+B — Browser Publisher Foundation  
**Verdict:** **BROWSER PUBLISHER FOUNDATION COMPLETE**

---

## Scope delivered

| Phase | Deliverable | Status |
|-------|-------------|--------|
| A | `BrowserDestinationAdapter` interface | Done |
| A | Destination registry (no switch-case) | Done |
| A | Capability registry | Done |
| A | Stub adapters: timeline / group / page_web | Done (no DOM) |
| B | Mission template `publish-browser-content` | Done |
| B | 8 workflow step handlers (stub) | Done |
| B | `executePublishWorkflow()` | Done |
| B | `startPublishMissionRun()` bridge | Done |
| B | `publishEvidenceService` | Done |
| — | Graph publisher deprecated (not default) | Done |
| — | `npm run test:browser-publisher-foundation` (35 tests) | Pass |

**Not in this phase:** Playwright/DOM, Facebook Timeline automation, scheduler wiring, worker handler wiring to `executePublishWorkflow`, UI rename Channel→Destination.

---

## Key paths

```
server/modules/social-publishing/browser/
  types.ts                    # BrowserDestinationAdapter contract
  capabilities.ts             # Capability presets + assert
  destinationRegistry.ts      # Registry + channel mapping
  adapters/
    stubDestinationAdapter.ts
    facebookStubs.ts

server/modules/social-publishing/runtime/
  publishEvidenceService.ts

server/modules/social-publishing/
  publishMissionBridge.ts     # startPublishMissionRun
  publishWorkflowContext.ts

server/modules/mission-engine/
  domain/publishMissionTemplate.ts
  application/publishWorkflowExecutionService.ts
  steps/browserPublishSteps.ts
```

---

## Env flags

| Flag | Default | Meaning |
|------|---------|---------|
| `SOCIAL_ALLOW_GRAPH_PUBLISH` | off | Legacy Graph publisher in registry |
| `BROWSER_PUBLISH_LIVE` | off | When `1`, steps may run non-stub (Phase C+) |

---

## Next phase (C)

1. Wire `publishSocialHandler` → `executePublishWorkflow`
2. Wire queue enqueue → `startPublishMissionRun` (not scheduler change in isolation)
3. Implement `FacebookTimelineBrowserAdapter` with Playwright (reuse `getPublishPage`)
4. UI: Browser Destination labels + capabilities read-only

---

## Tests

```bash
npm run test:browser-publisher-foundation
npm run lint
```
