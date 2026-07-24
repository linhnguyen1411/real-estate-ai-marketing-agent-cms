# Engineering Constitution

> **Highest source of truth (SSOT) for this repository.**  
> Every development prompt, feature, bugfix, and refactor **MUST** read this document **before writing code**.  
> If a prompt conflicts with this Constitution, the agent **MUST warn first** — never proceed silently.

**Version:** 2.0.0  
**Effective:** 2026-07-24  
**Supersedes:** 1.0.0  
**Scope:** Entire repository (`real-estate-ai-marketing-agent-cms`)

Related:

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)
- [ADR index](../adr/README.md)

---

## Prompt Contract (mandatory gate)

Before any code change, the agent must complete:

| Step | Artifact |
|------|----------|
| Read Constitution | this file ✓ |
| Read Project Structure | `PROJECT_STRUCTURE.md` ✓ |
| Read relevant ADRs | `docs/adr/` ✓ |
| Read Runtime Boundary | §3 + `runtime-boundary.mdc` ✓ |
| Impact Analysis | Affected / Not Affected table ✓ |
| Business Goal | Lead / Sales / Campaign / Knowledge / Publishing / Automation ✓ |

**If any row cannot be answered → do not code.**

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

### North-star metrics

| Priority | Metric |
|----------|--------|
| 1 | **Buyer** (qualified demand) |
| 2 | **Campaign** effectiveness |
| 3 | **Revenue** (expected → won) |
| 4 | **Automation** rate (work done without human ops friction) |

Every feature must serve at least one Business Goal (§ Business Goal). If it does not, it should not ship.

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

Format: Problem · Alternatives · Decision · Consequences.

New structural choices → new ADR in the same PR when possible.

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
| **Automation** | Reduce manual ops friction |

If none apply → challenge the feature before coding.

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

| Stage | Required |
|-------|----------|
| Audit | Existing owners, ADRs, reuse candidates |
| Architecture | Architecture First answers |
| Impact Analysis | Affected / Not Affected |
| Implementation | Minimal diff; honor boundaries |
| Tests | Scenario · Coverage · Result |
| Cleanup | Code + test data (§ Data / Code Cleanup) |
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

## 8. Mandatory Pre-Commit Checklist

- [ ] Architecture First answered  
- [ ] Impact Analysis table present  
- [ ] Business Goal declared  
- [ ] DRY / SOLID / KISS / YAGNI  
- [ ] No duplicate module / no unauthorized `V2`  
- [ ] Protected modules untouched (or Runtime Impact documented)  
- [ ] No dead code / unused imports  
- [ ] No TODO/FIXME left undocumented as debt  
- [ ] No console.log / commented code / temp patch / mock KPIs  
- [ ] Tests + cleanup done  
- [ ] Docs/ADR updated if needed  

---

## 9. Quality Gate (before commit)

| Gate | Required |
|------|----------|
| Architecture | PASS |
| SOLID | PASS |
| DRY | PASS |
| KISS | PASS |
| YAGNI | PASS |
| Tests | PASS (scenario/coverage/result) |
| Cleanup | PASS |
| Docs | PASS |
| Release Report | PASS |
| Smoke | PASS (when deploy/restart in scope) |
| Production Ready | YES |

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

Update when behavior changes: structure, ADR, API notes, release summary. Standards live under `docs/engineering/`.

---

## 14. Report Standard

Every feature summary includes:

1. Objective  
2. Business Goal  
3. Architecture  
4. Impact Analysis (Affected / Not Affected)  
5. Deliverables  
6. Runtime Impact (if any)  
7. Tests (scenario/coverage/result)  
8. Cleanup  
9. Known Issues  
10. Technical Debt / Next  
11. AI Self Review  

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

## 19. Definition of Done

Done only when:

- [x] Architecture First + Impact + Business Goal  
- [x] Code  
- [x] Tests (scenario/coverage/result)  
- [x] Cleanup (code + test data)  
- [x] Docs / ADR as needed  
- [x] Release Report  
- [x] Deploy/restart when required  
- [x] Smoke + Health  
- [x] Quality Gate PASS  
- [x] No dead code / obsolete contradictory docs  
- [x] Constitution Prompt Contract satisfied  

---

## Project Rule

1. Constitution is the **operating system** of the project.  
2. Cursor rules under `.cursor/rules/` reinforce this (alwaysApply).  
3. Conflicting prompts → **warn**, then propose a compliant path.  
4. Campaign is the center; Buyer is the KPI; Revenue is the end goal; Automation is the success measure.

---

*End of Engineering Constitution v2.*
