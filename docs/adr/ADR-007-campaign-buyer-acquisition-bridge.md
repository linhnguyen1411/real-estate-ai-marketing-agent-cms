# ADR-007 — Campaign → Buyer Acquisition Bridge

**Classification:** Business  
**KPI tier:** Campaign → Finding → Lead → Qualified Buyer  
**Status:** Accepted  
**Date:** 2026-07-27  
**Supersedes intent of:** H2.3 remaining gap (campaign planning ≠ buyer pipeline)  
**Note:** Filename requested as ADR-006 in the mission prompt, but [ADR-006](./ADR-006-constitution-final-lock.md) already exists. This decision is **ADR-007**.

---

## Problem

Campaign Runtime (ADR-005) creates a durable **Planning Spine**:

```text
Telegram → Campaign → Research → Mission Proposal → Content → Waiting Approval
```

A separate **Buyer Graph** already produces Qualified Buyers:

```text
Scanner → Normalize → Decision → Lead Acquisition → Sales → Telegram LEAD Alert
```

These graphs are **not connected**. Campaign approval advances planning status and may enqueue advisory recommendations, but it does **not** request real buyer acquisition. Mission proposals suggest `scan-facebook-group` templates without creating `AgentMission` runs or `scan_source` jobs.

Result: Campaign looks complete in Workspace while no new Findings / Candidates / HOT buyers are produced from that campaign.

---

## Current Architecture

| Graph | Owner | Durable? | Produces Qualified Buyer? |
|-------|-------|----------|---------------------------|
| Planning Spine | `planning/` | `ai_sales_campaigns.state` | No (ranks existing findings only) |
| Buyer Graph | Scanner Runtime + Decision + Lead + Sales | Findings / extractedData | Yes |

Soft link today: `lead-acquisition/campaignMatcher` may *read* active campaigns. No campaign *write* into acquisition.

---

## Constraints (non-negotiable)

Planning **MUST NOT**:

- Import or call Scanner Runtime / Browser / Fleet / Queue claim internals  
- Bypass Publisher approval for publish side-effects  
- Dump raw scanner payloads into Campaign Workspace  
- Hardcode API keys or log secrets / unnecessary PII  

Planning **MAY**:

- Emit a durable **Acquisition Request** contract  
- Call **public façades** owned outside Planning (`enqueueSourceScan`, Lead/Sales process APIs) via a dedicated bridge module  
- Compose summaries + reference IDs back into Campaign state / Trace  

Protected modules stay Protected (Constitution § Runtime Boundary). Prefer **read + compose**. Using the existing public job enqueue façade is **not** a Scanner Runtime code change.

---

## Alternatives

### A — Planning calls Scanner directly

Planning imports worker/scan handlers and drives browser/CDP.

| Dimension | Score |
|-----------|-------|
| Architecture | ❌ Breaks Separation of Concerns / Runtime Boundary |
| Reliability | ❌ Couples business lifecycle to execution crashes |
| Observability | ❌ Mixes Campaign Trace with Runtime debug |
| Idempotency | Hard without duplicating Queue rules |
| Security | ❌ Expands Planning privilege surface |
| Scalability | ❌ Single process owns too much |
| Complexity | Low short-term, high long-term |
| Runtime Boundary | **Violation** |

**Reject.**

### B — Planning creates Acquisition Intent / Mission Contract; Execution layer fulfills

Campaign (after Planning Approval) creates a durable `CampaignAcquisitionRequest`. A **bridge module** (not Scanner Runtime internals) translates the contract into existing public execution APIs (`enqueueSourceScan` / optional Mission Engine façade). Results return as a **Result Contract** summary to Campaign.

| Dimension | Score |
|-----------|-------|
| Architecture | ✅ Clear Planning vs Execution |
| Reliability | ✅ Request survives retries; execution idempotent via existing job serialize |
| Observability | ✅ Trace links campaignId → requestId → jobIds → findingIds |
| Idempotency | ✅ `idempotencyKey` on request + existing active-scan serialize |
| Security | ✅ Public façades only; no Browser/Fleet mutate |
| Scalability | ✅ Same worker fleet already scanning |
| Complexity | Medium (contract + state machine + aggregator) |
| Runtime Boundary | ✅ No Protected core edits |

### C — Pure Event / Command bus only

Planning emits `CAMPAIGN_ACQUISITION_REQUESTED`; async consumers react.

| Dimension | Score |
|-----------|-------|
| Architecture | ✅ Loose coupling |
| Reliability | Weaker without durable request SSOT on campaign |
| Observability | Events alone can be lossy without campaign-owned state |
| Idempotency | Needs same contract storage anyway |
| Complexity | Higher (bus + consumer + reconcile) |
| Runtime Boundary | ✅ If consumer stays outside Scanner internals |

**Events are useful as notifications**, but insufficient alone as SSOT.

---

## Decision

**Choose B, with C as notification overlay.**

1. **SSOT:** `CampaignAcquisitionRequest` persisted on the living campaign (`state.acquisition` / request list) with explicit lifecycle — not booleans.  
2. **Bridge owner:** new façade module `server/modules/campaign-acquisition/` (Bounded Context: Campaign ↔ Lead). Planning calls bridge **façade only**; bridge calls public `enqueueSourceScan` (+ existing Lead/Sales processors).  
3. **Trigger:** after **Planning Approval** (`approveCampaign`), bridge may create/queue an acquisition request for public-source scan policy. Publish / DM / contact remain under their own approval policies.  
4. **Rule-first unchanged:** Scanner → Normalize → Decision → Candidate → AI only when allowed (ADR-003 + existing enrichment). AI fallback via AI Gateway (Gemini → Kira → Local).  
5. **Telegram:** acquisition progress → **OPS**; Buyer Alert → **LEAD**; critical bridge failures → **CRITICAL**.  
6. **Workspace / Trace:** compose summary metrics + reference IDs only.

This preserves ADR-005 (Campaign center) without converting Planning into Runtime.

---

## Contract sketch (normative)

### CampaignAcquisitionRequest

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | cuid |
| `campaignId` | yes | |
| `missionProposalId` | no | planning mission proposal id |
| `goal` | yes | |
| `keywords` | yes | string[] |
| `sourceTypes` | yes | e.g. `facebook_group`, `website` |
| `targetProperty` | no | property hint |
| `location` | no | |
| `budget` | no | advisory |
| `priority` | yes | campaign priority |
| `requestedBy` | yes | actor |
| `approvalState` | yes | `planning_approved` \| `blocked` \| … |
| `status` | yes | see state machine |
| `idempotencyKey` | yes | unique per campaign+mission+goal hash |
| `attempt` | yes | |
| `jobIds` | yes | scan job refs |
| `sourceIds` | yes | |
| `createdAt` / `updatedAt` / `completedAt` | yes/opt | |
| `result` | no | Result Contract |
| `lastError` | no | |

### Lifecycle (state machine)

```text
PENDING → APPROVED → QUEUED → RUNNING → WAITING_RESULTS
  → COMPLETED | PARTIAL | FAILED
CANCELLED | BLOCKED (terminal / hold)
```

No `started=true` / `completed=true` flags as SSOT.

### Result Contract (summary only)

```text
sourcesScanned, postsSeen, candidates, qualified, hot, findingIds[],
errors[], coverage, nextAction
```

---

## Consequences

### Positive

- Campaign can **request** real buyer search without owning Scanner  
- Reuses Decision / Lead / Sales / Buyer Alert (No Duplicate Module)  
- Idempotent retries via `idempotencyKey` + existing scan serialize  
- Clear OPS vs LEAD Telegram routing  

### Negative / tradeoffs

- Acquisition quality depends on existing active `AgentSource` coverage  
- Bridge is asynchronous; Workspace must show RUNNING / WAITING_RESULTS honestly  
- Without matching sources → PARTIAL/FAILED with next action (add sources), not fake metrics  

### Affected

- `planning/` (approve hook → bridge façade; workspace compose)  
- `campaign-acquisition/` (new module — contract + fulfill + summarize)  
- Execution Trace / OPS notifications (compose)  
- Soft: `agent/agentJobService.enqueueSourceScan` (**public façade call only**)  

### Not Affected (Protected)

- Scanner Runtime internals · Fleet · Queue claim cores · Browser · Scheduler · Publisher Runtime · agent-worker scan handlers  

### New dependencies

- Campaign state schema fields for acquisition request/result  
- Bridge module façade  

### Failure modes

| Failure | Behavior |
|---------|----------|
| No active sources | BLOCKED / FAILED + nextAction |
| Scanner/worker down | WAITING_RESULTS / PARTIAL; jobs remain queued |
| All findings discarded | COMPLETED with qualified=0 (honest) |
| AI quota exhausted | Rule-first still runs; AI enrich skipped/fallback |
| Duplicate approve | Same `idempotencyKey` → reuse request |
| Telegram fail | Lifecycle continues; notify best-effort |

### Rollback

1. Feature-flag / skip bridge call in `approveCampaign`  
2. Leave campaign planning spine intact (ADR-005)  
3. Orphan acquisition requests stay in campaign JSON; no schema migration required if JSON-only  

### Follow-ups

- Optional: materialize planning mission proposals into `AgentMission` when product needs Mission Engine graphs  
- Optional: ADR for Campaign → Publisher after separate Publish Approval  

---

## Classification checklist

| Question | Answer |
|----------|--------|
| Module owner | `campaign-acquisition` (+ Planning compose) |
| Bounded Context | Campaign ↔ Lead |
| Reuse? | enqueueSourceScan, Decision, Lead Acquisition, Sales Layer, Buyer Alert, Trace |
| KPI tier | Campaign → Qualified Buyer |
| Feature class | Business |
| North Star | Campaign approval can trigger real buyer search → Qualified Buyer |
