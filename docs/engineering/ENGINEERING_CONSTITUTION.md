# Engineering Constitution

> **Highest source of truth (SSOT) for this repository — FINAL LOCK (v2.1).**  
> Every development prompt, feature, bug fix, and refactor **MUST** read this document **before writing code**.  
> If a prompt conflicts with this Constitution, the agent **MUST warn first** — never proceed silently.  
> **After H0.0.2: do not add new Constitution rules.** Architecture change → **ADR only**. Do **not** edit this file unless Product Philosophy or Engineering Principles change (see § ADR Policy).

**Version:** 2.1.0  
**Effective:** 2026-07-25  
**Supersedes:** 2.0.0  
**Scope:** Entire repository (`real-estate-ai-marketing-agent-cms`)  
**Status:** Operating System — **FINAL LOCK**

Related:

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)
- [ADR index](../adr/README.md)
- [Evolution log](../evolution/README.md)

---

## PROJECT NORTH STAR

**Generate Qualified Buyers Automatically.**

This is the highest KPI of the project.

We are **not** optimizing for:

- CMS  
- CRM  
- Facebook Bot  
- Automation-as-the-goal  

**Automation is a means.**  
**Buyer is the objective.**  
**Revenue is the outcome.**

Every feature hereafter must answer:

> How does this feature help create a **Qualified Buyer**?

If it does not relate → strongly consider **not doing it**.

---

## Prompt Policy (mandatory gate)

Every development prompt must follow this flow. **Missing any step → do not code.**

```text
Read Constitution
  → Read ADR
  → Read Runtime Boundary
  → Architecture Audit
  → Impact Analysis
  → Implementation
  → Cleanup
  → Report
```

| Step | Artifact |
|------|----------|
| Read Constitution | this file ✓ |
| Read ADR | relevant `docs/adr/*` ✓ |
| Read Runtime Boundary | § Runtime Boundary ✓ |
| Architecture Audit | reuse / dead / debt signals ✓ |
| Impact Analysis | Affected / Not Affected ✓ |
| Implementation | only after gates above ✓ |
| Cleanup | code + test data + dead artifacts ✓ |
| Report | Release Report template ✓ |

Also declare: **Business Goal**, **Feature Classification**, **KPI Pyramid tier**, **North Star link** (how it creates Qualified Buyers).

---

## 0. Product Philosophy

### Project Vision

We are building an **AI Sales Employee** — an autonomous marketing & sales operator for real estate.

We are **not** primarily building:

- a generic CMS  
- a generic CRM  
- a Facebook bot toy  

Those UIs may exist as **shells**. The product is the employee.

### Capability map (not the center)

| Capability | Role |
|------------|------|
| Scanner | Find market signals / posts |
| Publisher | Distribute content |
| Knowledge | Rules & learning memory |
| Decision | Qualify / discard / route |
| Campaign | **Center of gravity** — living go-to-market work |
| Sales | Journey, pipeline, revenue |

### North-star alignment

| Priority | Metric |
|----------|--------|
| 1 | **Qualified Buyer** (North Star) |
| 2 | **Campaign** effectiveness |
| 3 | **Revenue** (outcome) |
| 4 | **Automation** (means / success measure of ops leverage) |

Every feature must serve at least one Business Goal (§ Business Goal) **and** explain its path to Qualified Buyer.

---

## BUSINESS KPI PYRAMID

```text
Revenue
  ↑
Closed Won
  ↑
Negotiation
  ↑
Qualified Buyer   ← NORTH STAR
  ↑
Lead
  ↑
Finding
  ↑
Scanner
```

Every module must declare which **tier(s)** it moves:

| Module | Primary tier impact |
|--------|---------------------|
| Scanner | Finding |
| Decision | Lead |
| Sales | Negotiation → Closed Won |
| Campaign | Revenue (via Buyer pipeline) |
| Knowledge | Qualified Buyer |
| Publisher | Lead |

Feature / ADR / module docs should state: **KPI tier = …**

---

## Feature Classification

Every feature, ADR, and module declares one class:

| Class | Meaning |
|-------|---------|
| **Core** | Essential product capability (e.g. Knowledge) |
| **Business** | Direct GTM / revenue path (e.g. Campaign) |
| **Infrastructure** | Platform substrate (e.g. Fleet) |
| **Experimental** | Time-boxed trial (e.g. TikTok) — must have expiration |

Examples: Campaign = Business · Fleet = Infrastructure · Knowledge = Core · TikTok = Experimental.

---

## 1. Engineering Principles

Mandatory. Non-negotiable.

| Principle | Meaning |
|-----------|---------|
| **DRY** | One business rule in one module. No duplicate scoring, safety, or planning. |
| **KISS** | Simplest design that meets the mission. |
| **YAGNI** | No speculative Runtime / Scanner / Publisher extras. |
| **SOLID** | Focused services; extend via composition; depend on façades. |
| **Composition over Inheritance** | Compose planners / ports / handlers. |
| **Single Source of Truth** | One authoritative reader for each metric/state. |
| **Separation of Concerns** | Executive ≠ Operations. Planning ≠ Publisher Core. |
| **Clean Architecture** | `types` → `store/service` → `api` → adapters. Inward only. |
| **Architecture First** | Design answers before code (§ Architecture First). |
| **No Duplicate Module** | Reuse existing modules; no `V2`/`New`/`Helper` without audit. |

**Forbidden**

- Duplicate business logic across Admin / Telegram / Worker  
- God Services / giant utils  
- Hardcoded secrets / magic numbers without names  
- Silent catch-and-ignore  
- `xxxV2`, `xxxNew`, `xxxHelper`, `xxxUtils` created without proving no existing owner  

---

## 2. Architecture First

**Before code**, answer all of the following. Incomplete answers → **stop**.

1. Which **module** owns this feature?  
2. Which **Bounded Context** is it in? (Campaign / Lead / Sales / Knowledge / Publishing / Operations / Executive / Runtime)  
3. Does an existing module already do this?  
4. Can we **reuse** it (compose/extend) instead of inventing?  
5. Does the design break **Separation of Concerns**?  
6. Does it create a **circular dependency**?  
7. Does it violate **Clean Architecture** (UI/Telegram owning business rules, etc.)?  
8. Which **KPI Pyramid tier** does it move?  
9. What is its **Feature Classification**?  
10. How does it help create a **Qualified Buyer**?  

Output a short Architecture block in the chat/report before implementation.

### No Duplicate Module

Mandatory search before creating files:

- Campaign Planner / Planning  
- Knowledge  
- Decision  
- Lead Acquisition / Lead Center  
- Sales Layer  
- Publisher / Social Publishing  
- Scanner / Mission Engine  
- Executive Dashboard / Execution Trace  

If found → **reuse**. Creating parallel modules requires an ADR.

### Architecture Decision Records

Large decisions live in `docs/adr/`:

| ADR | Topic |
|-----|--------|
| [ADR-001](../adr/ADR-001-stateless-execution.md) | Stateless Execution |
| [ADR-002](../adr/ADR-002-browser-lease.md) | Browser Lease |
| [ADR-003](../adr/ADR-003-decision-engine.md) | Decision Engine |
| [ADR-004](../adr/ADR-004-knowledge-center.md) | Knowledge Center |
| [ADR-005](../adr/ADR-005-campaign-workspace.md) | Campaign Workspace |
| [ADR-006](../adr/ADR-006-constitution-final-lock.md) | Constitution Final Lock |

Format: Problem · Alternatives · Decision · Consequences · **Classification**.

---

## ADR Policy (FINAL LOCK)

| Change type | Action |
|-------------|--------|
| Product Philosophy change | May amend Constitution (rare; version bump) |
| Engineering Principles change | May amend Constitution (rare; version bump) |
| Any other architecture / module / boundary / tech choice | **Must create ADR** — **do not edit Constitution** |
| New “engineering rules” wish-list | **Forbidden** — ADR or reject |

**After v2.1:** do not grow this document with more chapters/rules. Evolve via ADR + business capability code.

---

## 3. Runtime Boundary (Protected Modules)

These are **Protected**. Unrelated features **MUST NOT** modify them.

| Protected | Typical paths |
|-----------|----------------|
| **Runtime** | `server/agent-worker/`, control-plane runtime surfaces |
| **Fleet** | `control-plane/fleet/`, `fleet-orchestrator/` |
| **Queue** | Agent job claim/execute cores, outbox workers |
| **Browser** | Lease/session ownership, CDP page factories |
| **Scheduler** | `agentScheduler` / mission tick cores |
| **Publisher Runtime** | Social publish execute / bridge cores |
| **Scanner Runtime** | Scan execution / mission scan steps |

Also treat **Decision** and **Knowledge** cores as high-caution: prefer compose; structural change → ADR.

If modification is required:

1. Mission must explicitly authorize it  
2. Report must include **Runtime Impact** section  
3. Prefer compose/read over mutate  

**Default:** Prefer **read + compose**.

---

## 4. Impact Analysis

Before implementation, produce:

### Affected Modules

List modules/contexts that will change or be tightly coupled.

### Not Affected Modules

List protected and unrelated subsystems that stay untouched.

**Example**

| Affected | Not Affected |
|----------|--------------|
| Campaign / Planning | Runtime |
| Lead | Fleet |
| Knowledge | Browser |
| | Queue |
| | Scheduler |

This table is **mandatory** in the Release Report.

---

## 5. Business Goal

Every feature declares one or more:

| Goal | Meaning |
|------|---------|
| **Lead** | Find / qualify / route buyers |
| **Sales** | Pipeline, journey, revenue |
| **Campaign** | Living go-to-market work |
| **Knowledge** | Rules, learning, coverage |
| **Publishing** | Content distribution |
| **Automation** | Reduce manual ops friction (means, not North Star) |

If none apply → challenge the feature before coding.

---

## Weekly Architecture Audit

The agent must be able to self-audit. Checklist:

| Check | Look for |
|-------|----------|
| Dead Service | unused modules / exports |
| Duplicate Logic | scoring, safety, planning copied |
| Unused Docs | contradictory / obsolete |
| Unused Script | orphan `scripts/tmp-*` left forever |
| Deprecated API | unremoved surface |
| Feature Flag expired | past expiration |
| Technical Debt | unlogged intentional debt |
| Circular Dependency | import cycles |
| God Service | oversized orchestrators |
| Large Module | unbounded folder growth |
| Long Function | unreadable units |

**Output:** Architecture Audit Report (short table + findings) in chat or `docs/engineering/` / release notes when mission requests a full audit.

---

## AI Evolution Log

Track progress in [`docs/evolution/`](../evolution/README.md).

Metrics (one line per sprint is enough):

- Lead Precision  
- Lead Recall  
- Spam Rate  
- Buyer Conversion  
- Campaign Success  
- Knowledge Growth  
- Automation Rate  
- Publish Success  

Purpose: know whether the AI Sales Employee is **improving**.

---

## 6. Feature Development Flow

Mandatory sequence — **no jumping to code**:

```text
Audit
  → Architecture
  → Impact Analysis
  → Implementation
  → Tests
  → Cleanup
  → Release Report
  → Deploy
  → Smoke
```

Aligns with Prompt Policy. Architecture Audit is part of Audit.

| Stage | Required |
|-------|----------|
| Audit | Existing owners, ADRs, reuse, dead/debt signals |
| Architecture | Architecture First answers + Classification + KPI tier |
| Impact Analysis | Affected / Not Affected |
| Implementation | Minimal diff; honor boundaries |
| Tests | Scenario · Coverage · Result |
| Cleanup | Code + test data + Clean Repository checks |
| Release Report | Template in RELEASE_PROCESS |
| Deploy | Build / migrate / restart as needed |
| Smoke | Health + critical path |

---

## 7. Coding Standard

### Naming

| Kind | Convention |
|------|------------|
| Folders | `kebab-case` |
| Files | role suffix (`traceService.ts`) |
| Types | `PascalCase` |
| Functions | `camelCase`, verb-first |
| Stored payloads | include `version` when persisted |

### Comments / Imports / Errors / Logs

- Why, not what; no commented-out code  
- Import module façades; avoid cycles  
- Clear API errors; best-effort side channels must not break business path  
- No `console.log` debug; no secrets; no full prompt dumps (summaries only)  

### Code Lifetime

Temporary · Experimental · Feature Flag · Deprecated artifacts **must** have:

| Field | Required |
|-------|----------|
| Owner | who |
| Created | date |
| **Expires** | date or mission id |
| Removal plan | how |

Past expiration → agent **must cleanup** in the next related mission (or dedicated cleanup PR).

---

## Clean Repository

Before merge, the agent must self-check:

| Check | Action |
|-------|--------|
| Dead Docs | remove or mark superseded |
| Dead Scripts | delete or debt-log |
| Dead Components | remove |
| Dead APIs | remove or deprecate with expiration |
| Dead Tests | remove / fix |
| Obsolete Prompt | archive or delete |
| Obsolete Migration | never rewrite applied; document only |

If found → **cleanup now** or record under **Technical Debt** with roadmap.

---

## 8. Mandatory Pre-Commit Checklist

- [ ] North Star link (Qualified Buyer path) stated  
- [ ] Feature Classification declared  
- [ ] KPI Pyramid tier declared  
- [ ] Architecture First answered  
- [ ] Impact Analysis table present  
- [ ] Business Goal declared  
- [ ] DRY / SOLID / KISS / YAGNI  
- [ ] No duplicate module / no unauthorized `V2`  
- [ ] Protected modules untouched (or Runtime Impact documented)  
- [ ] Clean Repository checks done  
- [ ] No dead code / unused imports  
- [ ] No TODO/FIXME left undocumented as debt  
- [ ] No console.log / commented code / temp patch / mock KPIs  
- [ ] Tests + cleanup done  
- [ ] Docs/ADR updated if needed (Constitution untouched unless Philosophy/Principles)  

---

## 9. Release Quality Gate (Definition of Done)

| Gate | Required |
|------|----------|
| Code | PASS |
| Architecture | PASS |
| Tests | PASS (scenario/coverage/result) |
| Cleanup | PASS |
| Report | PASS |
| Deploy | PASS (when in scope) |
| Smoke | PASS (when in scope) |
| Health | PASS (when in scope) |
| No Test Data | PASS |
| No Dead Code | PASS |
| No Obsolete Docs | PASS |
| SOLID / DRY / KISS / YAGNI | PASS |
| Production Ready | YES |

**If any item fails → Feature = NOT DONE.**

---

## 10. Test Requirement

“PASS” alone is invalid.

| Field | Required |
|-------|----------|
| Scenario | What was exercised |
| Coverage | What surfaces/APIs |
| Result | Observed evidence |
| Environment | Branch / URL |
| Cleanup | What was deleted |

Layers: Smoke · Regression · Manual (when UI).

---

## 11. Data Cleanup

After tests, delete **test artifacts only**:

Drafts · Campaigns · Leads · Missions · Jobs · Traces · Notifications · Scheduler leftovers · Browser lease probes — identified by known test IDs (`h0-*`, `tmp-*`, probe names).

Never mass-wipe production business data.

---

## 12. Code Cleanup

Remove: unused scripts, obsolete docs, dead components/services, expired flags, stale TODOs, temporary helpers in `server.ts`.

---

## 13. Documentation

Update when behavior changes: structure, ADR, API notes, release summary, evolution log line when sprint ends.

Standards live under `docs/engineering/`.  
**Do not** amend Constitution for ordinary architecture — write ADR.

---

## 14. Report Standard

Every feature summary includes:

1. Objective  
2. North Star link (Qualified Buyer)  
3. Business Goal + Feature Classification + KPI tier  
4. Architecture  
5. Impact Analysis (Affected / Not Affected)  
6. Deliverables  
7. Runtime Impact (if any)  
8. Tests (scenario/coverage/result)  
9. Cleanup / Clean Repository  
10. Known Issues  
11. Technical Debt / Next  
12. AI Self Review  

---

## 15. Deploy Standard

See [RELEASE_PROCESS.md](./RELEASE_PROCESS.md).

```text
Build → Migration → Backup (prod) → Deploy → Health → Smoke → Rollback plan → Report
```

Every release must cover: **Architecture · Impact · Cleanup · Smoke · Rollback · Report**.

---

## 16. No-Impact / Runtime Impact

- Default: declare **Not Affected** protected list.  
- If protected code changed: mandatory **Runtime Impact** (what / why / risk / rollback).  

---

## 17. Technical Debt

Unfinished intentional work needs: Debt · Why · Risk · Roadmap. Unlogged debt is forbidden.

---

## 18. AI Self Review

After each feature: What went well · Weakness · Risk · Confidence (High/Medium/Low).

---

## Project Rule

1. Constitution v2.1 is the **Operating System** of the AI Sales Employee — **FINAL LOCK**.  
2. From this point: **no new Constitution rules** — only **Business Capability** (+ ADRs).  
3. Cursor rules under `.cursor/rules/` reinforce this (alwaysApply).  
4. Conflicting prompts → **warn**, then propose a compliant path.  
5. **Generate Qualified Buyers Automatically** is the North Star. Campaign is the center of gravity; Automation is a means; Revenue is the outcome.

---

*End of Engineering Constitution v2.1 — FINAL LOCK.*
