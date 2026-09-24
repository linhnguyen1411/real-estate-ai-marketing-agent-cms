# Baseline — Stabilization / Cleanup / Refactor Prep

**Captured:** 2026-07-14 (local Windows, post PR #13 merge)  
**Branch:** `feature/refactor`  
**HEAD:** `72d9eb6` — `Merge pull request #13 from linhnguyen1411/feature/ai-employee-platform`

## Git snapshot

| Item | Value |
|------|-------|
| Branch | `feature/refactor` |
| Commit | `72d9eb6dc61b419d1a430b21fef12976d2f828f1` |
| Parents | merges AI Employee onto prior refactor tip |
| Working tree at capture | clean for tracked AI Employee; untracked = this audit’s `docs/refactor/*` + cleanup scripts until committed |
| `git diff --stat` (tracked) | empty vs HEAD before audit edits |
| `git diff --check` | clean |
| Tracked files | **435** |
| Untracked (audit) | 17 → grows as scripts/docs land |
| `package-lock.json` SHA256 | `F18592656A8D707BC51C9F16BB8912F92B4591F4F33DC633393746DF1E607F3C` |

## Commands

| Command | Duration | Result |
|---------|----------|--------|
| `npm run lint` | ~30s | **PASS** |
| `npm run build` | see `_times.txt` | recorded below / in Stabilization Report |
| `npm run test:agent-regression` | see report | recorded after suite |
| `npm run cleanup:agent-runtime` | <1s | dry-run **0** candidates |
| `npx prisma validate` | — | run in Part 18 |

## Disk sizes (before apply cleanup)

| Path | Size | Files |
|------|------|-------|
| Repository (incl. node_modules) | **~1.31 GB** | ~14,173 |
| `node_modules` | **~828 MB** | ~11,861 |
| `dist` | **~6.8 MB** | 40 |
| `data` (gitignored) | **~129 MB** | 507 |
| `data/browser-profiles` | **~109 MB** | 504 |
| `docs` | ~197 KB | 41 |
| `scripts` | ~287 KB | 90 |
| `server` | ~1.4 MB | 154 |
| `src` | ~1.4 MB | 135 |
| `prisma` | ~76 KB | 9 |
| `chrome-extension` | path may be empty/absent in this checkout | — |
| `runtime/` | **MISSING** | profile default unused locally (CDP mode) |
| `logs/` / `backups/` / `coverage/` / `.cache/` | **MISSING** | — |

## Processes (pre-cleanup)

| Kind | Observation |
|------|-------------|
| PM2 | Not available locally |
| Node | **6** processes ~**1.36 GB** RSS total; `npm run dev` + `npm run agent:worker` (+ tsx children) |
| Chrome | **61** processes ~**10.6 GB** RSS; CDP `--remote-debugging-port` present |
| PostgreSQL | **33** backends ~**652 MB** |
| Ollama | Not observed |
| Playwright | Via agent worker (tsx), not separate playwright.exe |

## Host resources

| Metric | Value |
|--------|-------|
| Total RAM | ~31.9 GB |
| Free RAM | ~7.3 GB |
| Used | ~77.2% |
| CPU sample | ~55% |

## Rules for this phase

1. No business-behavior changes beyond diagnostics / safe dead-code cleanup.  
2. No delete without high-confidence entry in `DEAD-CODE-CANDIDATES.md`.  
3. Cleanup scripts dry-run by default.  
4. Graph Facebook implementation stays.  
5. Do **not** start R1.
