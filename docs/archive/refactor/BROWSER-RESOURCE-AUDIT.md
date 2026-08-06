# Browser Resource Audit

**Date:** 2026-07-14 · `feature/refactor` @ `72d9eb6`  
**Code:** `server/agent-worker/browserManager.ts`

## Rules (implemented)

| Rule | Status |
|------|--------|
| One worker-owned scan tab | `scanPage` + `getScanPage` reuse |
| No newPage per job when alive | `scanPageReused` |
| Crash/close → clear ref + recreate | `scanPageRecreatedAfterCrash` |
| Never close user tabs | warn at ≥10 pages |
| Shutdown closes scan tab only | CDP Chrome stays up |
| CDP Facebook concurrency = 1 | `beginCdpJob` / `releaseCdpLock` |

## Diagnostics (R0)

`getResourceDiagnostics()` folded into `sessionMetadata()` / heartbeat:

- `browserContexts`, `contextPageCount`, `workerOwnedScanPages`, `userOwnedPagesEstimate`
- `scanPageCreated|Reused|RecreatedAfterCrash`, `facebookConcurrentJobRejected`, `cdpBusy`
- `lastBrowserHeartbeatAt`
- Profile size via `npm run agent:diagnose-runtime`

## Gaps

| Gap | Notes |
|-----|-------|
| Event listener count | Not instrumented |
| Route/interceptor inventory | Manual review needed |
| 10 / 50 job + idle 10m memory series | **Not completed** this pass |
| Dual profile dirs | `data/browser-profiles` (~104 MB) vs unused `runtime/agent-browser-profile` |

## Selector policy

No Facebook selector changes in R0.
