# Engineering Constitution

> **Project root law.** Every feature, hotfix, and agent prompt MUST read this document before writing code.  
> If a prompt conflicts with this Constitution, **warn first** — do not proceed silently.

**Version:** 1.0.0  
**Effective:** 2026-07-24  
**Scope:** Entire repository (`real-estate-ai-marketing-agent-cms`)

Related:

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)

---

## 1. Engineering Principles

Mandatory. Non-negotiable.

| Principle | Meaning in this project |
|-----------|-------------------------|
| **DRY** | One business rule lives in one module. No duplicate lead scoring, publish safety, or campaign planning logic. |
| **KISS** | Prefer the simplest design that meets the stated mission. |
| **YAGNI** | Do not build Runtime/Scanner/Publisher “extras” when the mission is Dashboard, Trace, or Knowledge. |
| **SOLID** | Small, focused services; open for extension via composition; depend on module facades (`index.ts`), not internals. |
| **Composition over Inheritance** | Compose planners / ports / handlers. Avoid deep class hierarchies. |
| **Single Source of Truth** | Metrics, campaign state, and ops snapshots have one authoritative reader. Do not invent parallel stores “for convenience”. |
| **Separation of Concerns** | Executive UI ≠ Runtime ops. Planning ≠ Publisher Core. Telegram formatting ≠ business rules. |
| **Clean Architecture** | `types` → `store/service` → `api` → UI/Telegram adapters. Inward dependencies only. |

**Forbidden patterns**

- Duplicate business logic across Admin / Telegram / Worker
- Copy-paste of large blocks “just for this feature”
- God Services (`*Service.ts` that owns half the product)
- Giant `utils.ts` dumping grounds
- Hardcoded secrets, env-specific hosts, magic numbers without named constants
- Silent catch-and-ignore of business failures

---

## 2. Project Structure

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for the canonical map.

**Rules**

- New product capability → new or existing **module** under `server/modules/<name>/` with `index.ts` public API.
- Admin surfaces → `src/features/agent/<feature>/` (or CMS pages under `src/` when core CRM).
- Do **not** create cross-module deep imports (`../other-module/internalFile`). Import from the module `index.ts`.
- Do **not** put business rules in `server.ts`, Telegram routers, or React pages.

---

## 3. Runtime Boundary (Protected Modules)

The following are **Protected Modules**. Feature work **MUST NOT** modify them unless the mission explicitly authorizes it:

| Area | Typical paths |
|------|----------------|
| **Runtime** | `server/agent-worker/`, `server/modules/control-plane/runtime*`, automation runtime snapshots |
| **Fleet** | `server/modules/control-plane/fleet/`, `fleet-orchestrator/` |
| **Queue / Jobs core** | Agent job claim/execute cores, outbox workers (unless mission is Queue) |
| **Browser** | Browser lease/session ownership, CDP publish page factories (unless mission is Browser) |
| **Publisher** | `server/modules/social-publishing/` publisher cores & bridges (unless mission is Publisher) |
| **Scheduler** | `server/agent/agentScheduler.ts` and mission tick cores (unless mission is Scheduler) |
| **Scanner Runtime** | Scan execution / mission-engine scan steps (unless mission is Scanner) |

**Allowed without touching Protected Modules**

- Compose-only dashboards / traces / knowledge / decision / planning facades
- Telegram Copilot intents that call planning or read metrics
- Admin UI redesigns that call existing APIs

**Rule:** Prefer **read + compose** over **mutate protected cores**.

---

## 4. Coding Standard

### Naming

| Kind | Convention | Example |
|------|------------|---------|
| Folders | `kebab-case` | `execution-trace/`, `lead-center/` |
| Modules | `kebab-case` directory | `sales-layer` |
| Files | `camelCase` or role suffix | `traceService.ts`, `kpiTypes.ts` |
| Types | `PascalCase` | `ExecutionTrace`, `LivingCampaign` |
| Functions | `camelCase`, verb-first | `buildExecutiveKpiDashboard` |
| Constants | `SCREAMING_SNAKE` or `UPPER` for true constants | `SETTING_KEY` |
| DTOs / API payloads | Explicit types; version field when stored | `version: 'h06_trace_v1'` |
| Prisma / DB | Follow existing schema; no drive-by renames | — |

### Comments

- Explain **why**, not what.
- No commented-out code in commits.
- Module header: one-line purpose + “does not touch X” when compose-only.

### Imports

- Prefer module public exports.
- No circular imports between `planning` ↔ `control-plane` ↔ `social-publishing` without a clear façade.

### Error handling

- Fail with clear messages at API boundaries (`status: 'error', message`).
- Best-effort side channels (event bus, notifications) must not break the business path.
- Never swallow errors without logging or surfacing.

### Logging

- Prefer structured, domain logs (`[planning]`, `[telegram-console]`).
- No `console.log` debug litter in committed code.
- No secrets in logs.

### Dependency style

- Explicit deps via function args / ports (Copilot `ControlPlanePort` pattern).
- Avoid hidden global mutable state except deliberate stores (AppSetting JSON, ALS for trace context).

---

## 5. Feature Development Process

Every feature follows this sequence:

```text
Audit → Design → Implement → Test → Cleanup → Release Report → Deploy → Smoke Test
```

| Stage | Required output |
|-------|-----------------|
| **Audit** | Current files, owners, protected boundaries |
| **Design** | Approach, SSOT, no-impact list |
| **Implement** | Minimal diff; honor mission scope |
| **Test** | Smoke + regression + manual (with scenarios) |
| **Cleanup** | Delete test data, temp scripts, dead code |
| **Release Report** | Per Report Standard (§11) |
| **Deploy** | Per Deploy Standard (§12) |
| **Smoke** | Health + critical path on live/local target |

---

## 6. Mandatory Pre-Commit Checklist

Before every commit, self-check:

- [ ] DRY — no duplicated business logic
- [ ] SOLID — no new god service
- [ ] No duplicate types/APIs for the same concept
- [ ] No dead code
- [ ] No unused imports
- [ ] No leftover `TODO` / `FIXME` for this mission (or documented as Technical Debt)
- [ ] No `console.log` debug
- [ ] No commented-out code blocks
- [ ] No temporary patch left “for later”
- [ ] No mocks / fake KPIs / random placeholders in production paths
- [ ] Protected modules untouched (unless mission allows)
- [ ] Commit message matches agreed format

---

## 7. Test Requirement

“PASS” alone is **invalid**.

Each feature test record must include:

| Field | Example |
|-------|---------|
| **Scenario** | Create campaign via Telegram utterance → waiting_approval |
| **Coverage** | Trace steps Intent→…→Response; `/trace`; Campaign Center timeline |
| **Result** | Observed statuses, durations, HTTP 200, UI render |
| **Environment** | Local CMS `:3000` / branch name |
| **Cleanup** | What test data was deleted |

Required layers:

1. **Smoke** — critical path of the feature  
2. **Regression** — adjacent Executive / Campaign / Telegram paths still work  
3. **Manual verification** — CEO/operator UX when UI is in scope  

---

## 8. Data Cleanup

After testing, **mandatory** deletion of test artifacts only (never wipe real business data):

- Test drafts / publish jobs (`h0-*`, `tmp-*`, known probe IDs)
- Test campaigns / missions / leads / findings created for the probe
- Trace rows / AppSetting probe keys created for the test
- Notifications / scheduler leftovers from the probe
- Browser lease / profile junk created by the probe (if any)

Prefer cancel/delete **known test IDs**. Do not mass-delete production channels or live campaigns.

---

## 9. Code Cleanup

After the feature lands:

- Remove unused scripts under `scripts/` created for the probe
- Remove obsolete docs that contradict the new truth
- Remove deprecated API stubs only when replaced and unused
- Remove dead React components / services
- Remove expired feature flags and stale TODOs for this scope
- Do not leave “temporary” helpers in `server.ts`

---

## 10. Documentation

If the feature changes behavior, update the relevant docs:

- Architecture / module README (this folder or module header)
- API surface (route list in module or release note)
- Product README only when user-facing entrypoints change
- Release notes / chat summary with commit SHA

New engineering standards belong under `docs/engineering/`.

---

## 11. Report Standard

Every completed feature should be summarizable as:

1. **Objective** — mission goal  
2. **Architecture** — what was composed / added  
3. **Deliverables** — files, APIs, UI, Telegram commands  
4. **Impact** — who benefits; what changed  
5. **No-Impact Declaration** — protected subsystems untouched (§13)  
6. **Known Issues** — honest gaps  
7. **Technical Debt / Next** — if any (§14)  
8. **AI Self Review** — (§15)  

---

## 12. Deploy Standard

```text
Build → Migration (if any) → Backup (prod) → Deploy → Health → Smoke → Rollback plan → Report
```

- Local: restart CMS (`npm run dev` / agreed process), hit `/api/health`
- Prod: follow ops runbook; never force-push protected branches without explicit ask
- Always verify health before declaring done

---

## 13. No-Impact Declaration

Every feature MUST declare which subsystems were **not** affected, e.g.:

```text
No impact: Runtime · Fleet · Queue · Browser · Publisher · Scheduler · Scanner Runtime
```

If a protected module **was** touched, the mission must have authorized it and the report must say so explicitly.

---

## 14. Technical Debt

Intentional omissions must be recorded:

| Field | Content |
|-------|---------|
| Debt | What was skipped |
| Why | Time/scope/risk |
| Risk | What breaks if ignored |
| Roadmap | When / which mission to fix |

Unlogged debt is not allowed.

---

## 15. AI Self Review

After each feature, the agent must self-evaluate:

| Lens | Prompt |
|------|--------|
| **What went well** | Clear wins |
| **Weakness** | Shortcuts, thin tests, naming |
| **Risk** | Prod risk, data, protected boundary |
| **Confidence** | High / Medium / Low + why |

---

## 16. Definition of Done

A feature is **done** only when all are true:

- [x] Code merged/committed as requested  
- [x] Tests recorded (scenario + coverage + result)  
- [x] Cleanup (code + test data)  
- [x] Docs updated when behavior changed  
- [x] Release-style summary provided  
- [x] Deploy/restart performed when required  
- [x] Smoke + health verified  
- [x] No leftover test data in the target environment  
- [x] No dead code / obsolete contradictory docs introduced  
- [x] No-Impact Declaration stated  
- [x] Constitution checklist passed  

---

## Project Rule (Agents & Humans)

1. **Read this file first** before implementing any development prompt.  
2. If the user prompt conflicts with this Constitution, **warn** and propose a compliant alternative.  
3. Prefer compose-only changes outside Protected Modules.  
4. Treat Executive/business surfaces and Runtime/ops surfaces as **different products** sharing one repo.

---

*End of Engineering Constitution.*
