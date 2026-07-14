# R0 Memory / Tab Stress

**Date:** 2026-07-14  
**Method:** `npm run agent:stress-10jobs -- --snapshot` (+ note on `--run`)

## Snapshot (worker stopped / restarting — not a 10-job series)

| Label | Node RSS MB | Chrome RSS MB | queued | running | pendingOutbox | Profile MB |
|-------|-------------|---------------|--------|---------|---------------|------------|
| before (stress script) | 84 | **10232** | 5 | 1 | 0 | legacy 109.4; runtime missing |

Raw: `docs/refactor/_r0-memory-raw.json`

## Chrome ~10 GB attribution

| Observation | Detail |
|-------------|--------|
| Chrome process count | ~60+ |
| CDP Chrome | present `:9222` + `user-data-dir` renderers |
| Non-CDP Chrome | separate personal Chrome instance also running |
| Worker profile | `runtime/agent-browser-profile` **missing** (CDP attach to user Chrome) |
| Legacy `data/browser-profiles` | ~109 MB (not proof of worker leak) |

**Conclusion:** Aggregate Chrome RSS ≈10 GB is **not attributed solely to Agent**. Large share is user browser + GPU/renderers. No evidence from this snapshot that worker owns 10 GB.

## Ten sequential Facebook jobs

**Not completed in R0 closure.** Harness exists: `npm run agent:stress-10jobs -- --run --source-id=<fbSourceId>` with worker up.

Required for READY:

| Checkpoint | Expected |
|------------|----------|
| after job 1 | scanPageCreated ≥1 |
| after jobs 2–10 | scanPageReused increasing; context pages stable |
| idle | no linear page growth |

## Listener / handle counts

Not instrumented beyond Node `activeHandles` on diagnose process. Worker-level listener counts still a gap.

## Verdict for this section

**Insufficient evidence for READY** on tab/memory stability criterion.
