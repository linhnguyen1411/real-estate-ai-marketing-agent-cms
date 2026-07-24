# Code Review Checklist

Use before every commit / PR.  
Parent: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md).

---

## A. Mission & Boundary

- [ ] Mission objective is clear; scope not expanded silently
- [ ] Protected modules untouched unless mission explicitly allows (Runtime / Fleet / Queue / Browser / Publisher / Scheduler / Scanner Runtime)
- [ ] No-Impact Declaration drafted for the report
- [ ] Prompt conflicts with Constitution were warned (if any)

---

## B. Design quality

- [ ] DRY — business logic not duplicated across API / Telegram / UI
- [ ] KISS / YAGNI — no speculative Runtime features
- [ ] SOLID — no new God Service / mega-util
- [ ] Single Source of Truth preserved for metrics/state
- [ ] Separation: Executive/business vs Operations/runtime
- [ ] Module façade (`index.ts`) used; no deep cross-imports

---

## C. Code hygiene

- [ ] Naming matches project conventions
- [ ] No unused imports / dead exports
- [ ] No dead components/services introduced
- [ ] No commented-out code
- [ ] No `console.log` debug left
- [ ] No hardcoded secrets / env hosts
- [ ] Magic numbers named or justified
- [ ] Error paths return clear messages
- [ ] No full prompt dumps in traces/logs (summaries only)

---

## D. API & data

- [ ] Response shape consistent (`status: success|error`)
- [ ] Types updated on client when API payload changed
- [ ] Migrations included if schema changed (and reviewed)
- [ ] No fake / random / placeholder production metrics

---

## E. Tests

- [ ] Smoke scenario documented (not just “PASS”)
- [ ] Coverage statement present
- [ ] Result / evidence noted
- [ ] Regression of adjacent paths considered
- [ ] Test data cleanup plan executed

---

## F. Cleanup

- [ ] Probe scripts removed or clearly permanent
- [ ] Test drafts / campaigns / jobs / traces / notifications cleaned
- [ ] Obsolete docs/flags not left contradictory
- [ ] Git status excludes runtime profile junk / secrets

---

## G. Docs & release

- [ ] Constitution-related docs updated if structure/process changed
- [ ] Module/API notes updated when behavior changed
- [ ] Commit message matches agreed format
- [ ] Ready for Release Report (§11 of Constitution)

---

## H. Reviewer quick vetoes

Reject / request changes if any of these appear:

1. Edits to Protected Modules without mission authority  
2. Duplicate business rules  
3. Mock KPIs in Executive Dashboard  
4. Test data left in shared/prod DB  
5. “PASS” with no scenario/coverage/result  
6. Secrets or `.env` in the commit  

---

## I. Agent self-signoff (copy into chat)

```text
Constitution: read ✓
Protected modules: untouched | authorized: ___
No-Impact: ___
Tests: scenario / coverage / result ✓
Cleanup: code + data ✓
Confidence: High | Medium | Low
```
