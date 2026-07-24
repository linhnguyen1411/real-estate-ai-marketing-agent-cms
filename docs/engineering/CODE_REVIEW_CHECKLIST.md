# Code Review Checklist

Use before every commit / PR.  
Parent: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) **v2**.

---

## A. Prompt Contract

- [ ] Constitution read
- [ ] Project Structure read
- [ ] Relevant ADRs read
- [ ] Runtime Boundary considered
- [ ] Impact Analysis table produced
- [ ] Business Goal declared
- [ ] Conflicting prompt warned (if any)

---

## B. Architecture Review

- [ ] Module owner identified
- [ ] Bounded Context / Workspace identified
- [ ] Existing module audited for reuse
- [ ] No unjustified `V2` / `New` / `Helper` / `Utils` module
- [ ] No Separation of Concerns violation
- [ ] No circular dependency
- [ ] Clean Architecture respected (no business rules in UI/Telegram routers)
- [ ] ADR created/updated when decision is structural

---

## C. Impact Review

- [ ] **Affected Modules** listed
- [ ] **Not Affected Modules** listed (incl. Protected)
- [ ] Runtime Impact section present **if** Protected code changed
- [ ] No silent scope creep into Fleet/Queue/Browser/etc.

---

## D. Business Goal

- [ ] Feature serves Lead / Sales / Campaign / Knowledge / Publishing / Automation
- [ ] Aligns with AI Sales Employee (not “CMS for CMS’s sake”)

---

## E. Design quality

- [ ] DRY / SOLID / KISS / YAGNI
- [ ] Single Source of Truth preserved
- [ ] Module façade (`index.ts`) used
- [ ] Composition over inheritance

---

## F. Code hygiene

- [ ] Naming conventions
- [ ] No unused imports / dead exports / dead components
- [ ] No commented-out code / `console.log`
- [ ] No secrets / magic numbers without names
- [ ] Temporary / flag / deprecated items have **expiration**
- [ ] No full prompt dumps in traces/logs

---

## G. API & data

- [ ] Consistent API envelope
- [ ] Client types updated
- [ ] Migrations reviewed if any
- [ ] No mock / random / placeholder production metrics

---

## H. Tests

- [ ] Scenario documented
- [ ] Coverage stated
- [ ] Result / evidence noted
- [ ] Regression considered
- [ ] Test data cleanup executed

---

## I. Cleanup & docs

- [ ] Cleanup Done (code + test data)
- [ ] No Dead Code
- [ ] No Obsolete Docs left contradictory
- [ ] ADR / engineering docs updated when needed
- [ ] Git excludes runtime junk / secrets

---

## J. Quality Gate signoff

| Gate | PASS? |
|------|-------|
| Architecture | |
| SOLID | |
| DRY | |
| KISS | |
| YAGNI | |
| Tests | |
| Cleanup | |
| Docs | |
| Release Report | |
| Smoke | |
| Production Ready | YES / NO |

---

## K. Reviewer vetoes

Reject if:

1. Protected modules changed without authorization + Runtime Impact  
2. Duplicate module / parallel `V2` without ADR  
3. Missing Impact Analysis or Business Goal  
4. Mock KPIs on Executive surfaces  
5. Test data left behind  
6. “PASS” without scenario/coverage/result  

---

## L. Agent self-signoff

```text
Constitution v2: read ✓
Architecture First: ✓
Impact: Affected […] | Not Affected […]
Business Goal: […]
Reuse: […]
ADR: n/a | ADR-xxx
Protected: untouched | Runtime Impact: …
Tests: scenario/coverage/result ✓
Cleanup: ✓
Quality Gate: PASS
Confidence: High | Medium | Low
```
