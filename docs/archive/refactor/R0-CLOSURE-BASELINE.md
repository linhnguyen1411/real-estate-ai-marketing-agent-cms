# R0 Closure Baseline

**Captured:** 2026-07-14 ~09:20 ICT  
**Branch:** `feature/refactor`  
**Commit:** `72d9eb6`

## Git

| Item | Value |
|------|-------|
| Working tree | Dirty: prior R0 cleanup + docs/scripts uncommitted |
| Diff stat (tracked) | ~1271 deletions (orphan UI, backend stubs, motion); browserManager diagnostics; package scripts |

## Processes

| Role | PID | RSS |
|------|-----|-----|
| API (`npm run dev` → tsx) | ~7544 | ~758 MB |
| Worker (`agent-worker`) | ~32688 | ~203 MB |
| CDP Chrome (`:9222`) | ~3240 (+ children) | included in Chrome total |
| Chrome total | **62** procs | **~11.3 GB** |

# Running jobs at capture
- Initially **4** running (later 3 stale offline workers + races)
- After recover --apply fail: **0** then restart may enqueue new

# Outbox
- pending: 0
- failed: 0

# Node
- API ~7544 ~758MB (was); Worker ~32688 ~203–383MB
# Chrome
- ~62 processes ~10–11 GB RSS (user + CDP)
