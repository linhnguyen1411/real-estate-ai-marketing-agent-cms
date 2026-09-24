# H2.4 — Campaign → Buyer Acquisition Bridge

**Date:** 2026-07-27  
**ADR:** [ADR-007](../adr/ADR-007-campaign-buyer-acquisition-bridge.md)  
**Commit:** `feat(campaign): bridge campaigns to buyer acquisition`  
**Verdict:** **PARTIAL**

## Objective

Connect Campaign Planning Spine to the real Buyer Graph **without** Planning calling Scanner Runtime internals.

## ADR Decision

**Option B** (+ event notify overlay): Planning Approval creates durable `CampaignAcquisitionRequest`; module `campaign-acquisition` fulfills via public `enqueueSourceScan` façade; results return as summary to Campaign Workspace.

Rejected Option A (Planning → Scanner direct) — Runtime Boundary violation.

## Architecture Before → After

**Before:** Campaign approve ≠ scan jobs ≠ new buyers  

**After:**

```text
Approve Campaign
  → Acquisition Request (idempotent)
  → enqueueSourceScan (public façade)
  → WAITING_RESULTS
  → summarize Findings → Lead Acquisition → Sales (reuse)
  → LEAD Buyer Alert (existing notify)
  → Workspace ACQUISITION panel
```

## New Contracts

- `CampaignAcquisitionRequest` + lifecycle state machine  
- `CampaignAcquisitionResult` summary (no raw scanner dump)  
- `idempotencyKey` per campaign+mission+goal+property  

## Files Changed

- `docs/adr/ADR-007-campaign-buyer-acquisition-bridge.md`  
- `docs/adr/README.md`  
- `server/modules/campaign-acquisition/*`  
- `server/modules/planning/campaignRuntime.ts` (approve hook)  
- `server/modules/planning/campaignWorkspace.ts`  
- `server/modules/planning/types.ts`  
- `scripts/test-campaign-acquisition-bridge-h24.ts`  
- `docs/release/RELEASE-H2.4-CAMPAIGN-ACQUISITION-BRIDGE.md`

## Affected / Protected

| Affected | Protected (untouched internals) |
|----------|----------------------------------|
| Planning approve compose | Scanner Runtime |
| campaign-acquisition | Fleet / Queue claim / Browser |
| Workspace / Trace memory | Scheduler / Publisher Runtime |
| Public `enqueueSourceScan` call only | agent-worker scan handlers |

## Real E2E Result

Utterance: `Hôm nay cần bán mạnh lô Mai Đăng Chơn [h2.4-acq-bridge]`

| Step | Result |
|------|--------|
| Campaign create → waiting_approval | PASS |
| Approve → Acquisition Request | PASS |
| enqueue 8 sources / jobs | PASS (`WAITING_RESULTS`) |
| Idempotent reuse | PASS |
| Workspace acquisition panel | PASS |
| Findings / Qualified / HOT in same tick | PARTIAL (worker async) |
| Full buyer alert in same tick | PARTIAL |

## Capability table

| Capability | Status |
|---|---|
| Campaign | WORKS |
| Mission | WORKS |
| Acquisition Request | WORKS |
| Scanner Bridge | WORKS |
| Findings | PARTIAL |
| Decision | PARTIAL |
| Lead | PARTIAL |
| Sales | PARTIAL |
| Buyer Alert | PARTIAL |
| Campaign Workspace | WORKS |
| Trace | PARTIAL |
| AI Fallback | WORKS |

## Cleanup

Test campaigns deleted; acquisition-linked queued jobs cancelled on cleanup.

## Known Issues / Debt

- Immediate summarize often shows 0 posts until worker finishes scans  
- Source selection is heuristic (active sources scored by keyword) — not Mission Engine graph materialization  
- Stuck pre-existing `scan_source` jobs can be reused by enqueue serialize (by design)  

## Rollback

Remove approve hook calling `startAcquisitionAfterCampaignApproval`; planning spine remains (ADR-005).

## Verdict

**PARTIAL** — Bridge contract + enqueue path verified live; end-to-end Qualified Buyer in the same process tick depends on worker completing scans (async). Scanner Runtime code was **not** modified.
