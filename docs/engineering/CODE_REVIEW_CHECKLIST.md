# Code Review Checklist

Use before every commit / PR.  
Parent: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) **v2.1 FINAL LOCK**.

---

## A. Prompt Policy

- [ ] Constitution read
- [ ] Relevant ADRs read
- [ ] Runtime Boundary considered
- [ ] Architecture Audit considered (reuse / dead / debt)
- [ ] Impact Analysis table produced
- [ ] North Star link (Qualified Buyer path) stated
- [ ] Business Goal declared
- [ ] Feature Classification declared (Core / Business / Infrastructure / Experimental)
- [ ] KPI Pyramid tier declared
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
- [ ] ADR created/updated when decision is structural (**not** Constitution edit)

---

## C. Impact Review

- [ ] **Affected Modules** listed
- [ ] **Not Affected Modules** listed (incl. Protected)
- [ ] Runtime Impact section present **if** Protected code changed
- [ ] No silent scope creep into Fleet/Queue/Browser/etc.

---

## D. Business Goal & North Star

- [ ] Feature serves Lead / Sales / Campaign / Knowledge / Publishing / Automation
- [ ] Explains how it creates / improves **Qualified Buyers**
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
- [ ] Temporary / flag / deprecated / Experimental items have **expiration**
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

## I. Clean Repository

- [ ] Dead Docs / Scripts / Components / APIs / Tests checked
- [ ] Obsolete Prompt / Migration notes handled
- [ ] Cleanup Done (code + test data) **or** Technical Debt logged
- [ ] No Obsolete Docs left contradictory
- [ ] Evolution log line when sprint closes (if applicable)
- [ ] Git excludes runtime junk / secrets

---

## J. Release Quality Gate signoff

| Gate | PASS? |
|------|-------|
| Code | |
| Architecture | |
| Tests | |
| Cleanup | |
| Report | |
| Deploy | |
| Smoke | |
| Health | |
| No Test Data | |
| No Dead Code | |
| No Obsolete Docs | |
| Production Ready | YES / NO |

**Any fail → Feature = NOT DONE.**

---

## K. Reviewer vetoes

Reject if:

1. Protected modules changed without authorization + Runtime Impact  
2. Duplicate module / parallel `V2` without ADR  
3. Missing Impact Analysis, Business Goal, Classification, or North Star link  
4. Mock KPIs on Executive surfaces  
5. Test data left behind  
6. “PASS” without scenario/coverage/result  
7. Attempt to expand Constitution instead of writing ADR  

---

## L. Agent self-signoff

```text
Constitution v2.1: read ✓
North Star (Qualified Buyer): …
Classification: Core|Business|Infrastructure|Experimental
KPI tier: …
Architecture First: ✓
Impact: Affected […] | Not Affected […]
Business Goal: […]
Reuse: […]
ADR: n/a | ADR-xxx
Protected: untouched | Runtime Impact: …
Tests: scenario/coverage/result ✓
Clean Repository: ✓
Quality Gate: PASS
Confidence: High | Medium | Low
```
