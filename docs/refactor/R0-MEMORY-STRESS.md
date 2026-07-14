# R0 Memory / Tab Stress (final)

**Source:** `cmrixp8hg0006yh2zzmohpfve`

**Method:** `npx tsx scripts/stress-10jobs.ts --run --count=10 --idle-ms=600000`

**Worker:** `worker-LinhMSC-26580` (PID 26580) CDP mode

**Raw:** `docs/refactor/_r0-memory-raw.json` (committed); `_r0-stress10-raw.txt` local only

## Tab stability (PASS)

| Checkpoint | browserPageMode | contextPages | workerOwned | scanPageCreated | scanPageReused | contexts |
|------------|-----------------|--------------|-------------|-----------------|----------------|----------|
| after job 1 | reused | 10 | 1 | 1 | 3 | 1 |
| after job 5 | reused | 10 | 1 | 1 | 9 | 1 |
| after job 10 | reused | 10 | 1 | 1 | 18 | 1 |
| Jobs 1–10 log | **reused** every job | **10** every job | — | — | — | — |

- All 10 jobs completed sequentially; stopReason typically `known_post_streak`
- No `scanPageRecreatedAfterCrash`
- No linear page/context growth
- User-owned estimate ≈ 9 (stable); worker-owned = 1

## Memory (PASS with attribution)

| Checkpoint | Worker RSS MB | Chrome RSS MB | Chrome procs | pendingOutbox | running |
|------------|---------------|---------------|--------------|---------------|---------|
| before | 364 | 11746 | 65 | 0 | 0 |
| after job 1 | 434 | 12206 | 64 | 0 | 0 |
| after job 5 | 661 | 11057 | 46 | 0 | 0 |
| after job 10 | 845 | 11281 | 46 | 0 | 0 |
| idle 10m | 854 | 11063 | 46 | 0 | 0 |

### Interpretation

- **Tab criteria PASS:** one created scan page for the process lifetime; jobs 2–10 reuse; page count flat.
- **Chrome ~11 GB:** not Agent leak — includes user tabs; Chrome RSS **fell** from before→idle; process count dropped 65→46.
- **Worker Node RSS:** rose during 10 jobs then **plateau** across 10m idle (+9 MB). Not explained by page count growth. Acceptable for R0 gate; watch in R3 if linear growth resumes without plateau.
- Listener / active-handle totals: not fully instrumented end-to-end; page/context stability is the primary R0 evidence.

## Verdict

**PASS** for R0 tab stability gate. Chrome total RSS high ≠ Agent tab leak.
