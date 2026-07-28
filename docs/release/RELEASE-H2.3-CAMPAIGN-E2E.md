# H2.3 — Campaign Execution E2E Audit & Hardening

**Date:** 2026-07-27  
**Commit:** `test(campaign): validate autonomous sales campaign end to end`  
**Verdict:** **PARTIAL**

## Business Goal

| Field | Value |
|-------|--------|
| Business Goal | Campaign effectiveness + Lead path clarity |
| Feature class | Hardening / Audit (no new product UI) |
| KPI tier | Campaign → Finding → Lead (North Star: Qualified Buyer) |
| North Star link | Confirm which chain actually produces buyers vs planning-only |

## STEP 0 — Architecture (pre-code)

Two graphs exist:

1. **Planning spine (wired):** Telegram → Copilot rules → `createAndRunCampaign` → Research/Mission/Content/Lead-rank → Waiting Approval → OPS Telegram → Campaign Workspace/Trace  
2. **Buyer spine (separate):** Scanner → Decision Center → Lead Acquisition → Sales Layer → LEAD Telegram Buyer Alert  

Campaign create does **not** start Scanner / Decision / Acquisition / Sales / Buyer Alert.

## What was fixed in this mission

1. **Idempotency** — `findReusableActiveCampaign` + reuse on duplicate “bán mạnh …” (same property hint)  
2. **Telegram Approve/Reject/View/Complete** — routed through Copilot (`viaCopilot`) instead of Command Engine unknown  
3. **Phase soft-fail** — Research/Mission/Content/Lead-rank failures persist memory + `blockedReason`, do not crash whole campaign  
4. **Honest Decision step summary** — ranks existing findings; does not claim Decision Center create  

## Capability table (verified live)

| Capability | Status |
|---|---|
| Telegram → Campaign | WORKS |
| Research | WORKS |
| Mission | WORKS (proposals only) |
| Keyword | PARTIAL (trace tokens; no scan enqueue) |
| Decision | NOT_WIRED from campaign (separate finding path) |
| Lead | NOT_WIRED from campaign |
| Sales | NOT_WIRED from campaign |
| Telegram Buyer Alert | NOT_WIRED from campaign (LEAD channel used by findings) |
| Campaign Workspace | WORKS |
| Trace / Operational Memory | WORKS |
| Approval | WORKS (waiting_approval; Approve ≠ Publisher) |
| Fallback AI | WORKS (gateway Gemini→Kira→Local; campaign path is heuristic) |
| Idempotency | WORKS |
| Telegram channel routing | WORKS (planner→OPS, lead_found→LEAD) |

## Real test

Utterance: `Hôm nay cần bán mạnh lô Mai Đăng Chơn [h2.3-e2e-audit]`

- Campaign created → `waiting_approval`  
- Research + missions + task graph + workspace OK  
- 2nd identical command → **same campaign id** (reuse)  
- Cleanup: marker campaigns deleted (remaining 0)  

Script: `npx tsx scripts/test-campaign-e2e-h23.ts`

## Remaining gaps (not fixed — need ADR if wiring Runtime)

1. Campaign → Mission Engine / Scanner execution  
2. Campaign → Decision Center write path  
3. Campaign → Lead Acquisition / Sales Layer write  
4. Approve → Publisher Core (intentionally blocked today)  
5. Keyword → scan jobs  

## Affected / Not Affected

**Affected:** `planning/campaignRuntime`, `control-plane/telegram/router`, planning exports, E2E script  

**Not Affected (Protected):** Runtime / Fleet / Queue / Browser / Scheduler / Publisher / Scanner Runtime  

## Known issues

- AI gateway health reported down in local probe (keys/config env-dependent); fallback chain still present  
- Research remains heuristic (optional findings read) — not live scrape  

## Next recommended step

**H2.4 ADR:** optional bridge Campaign Waiting Approval → enqueue Mission Engine scan for campaign keywords — only after Product + Runtime Boundary review. Do not silently call Scanner from planning.
