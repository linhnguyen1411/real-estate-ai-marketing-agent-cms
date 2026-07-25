# Release Process

Official ship path.  
Parent: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) **v2.1 FINAL LOCK**.

Every release **must** include: **Architecture · Impact · Cleanup · Smoke · Rollback · Report**.

---

## 1. Pre-release gate

Do not deploy until:

1. Prompt Policy satisfied (Constitution → ADR → Boundary → Architecture Audit → Impact → …)
2. [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md) passed
3. Release Quality Gate PASS (all rows)
4. Tests recorded (Scenario · Coverage · Result)
5. Cleanup + Clean Repository done (or debt logged)
6. Impact Analysis table ready for the report
7. North Star / Classification / KPI tier declared
8. Rollback idea known (prior SHA / artifact)

---

## 2. Build

```bash
npm install
npx tsc --noEmit -p tsconfig.json
npm run build
```

Do not ship with known type/build failures.

---

## 3. Migration

If schema changed:

```bash
npx prisma migrate deploy
```

Backup before production migrate. Do not rewrite applied migrations.

---

## 4. Backup (production)

- DB snapshot
- Current commit/tag noted
- Rollback owner identified

---

## 5. Deploy

| Env | Action |
|-----|--------|
| Local | Restart CMS (`npm run dev` / agreed process) |
| Staging/Prod | Ops runbook |

Deploy only the intended commit. Exclude runtime profiles and secrets.

---

## 6. Health

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Expect HTTP 200. Failure → stop → rollback.

---

## 7. Smoke

Document Scenario · Coverage · Result · Env.

| Change type | Minimum smoke |
|-------------|---------------|
| Executive | Dashboard KPIs + refresh + drill-down |
| Campaign / Trace | Campaign detail Trace + `/trace` |
| Telegram | Intended slash/NL reply |
| Protected Runtime (authorized) | Only paths named in mission |

---

## 8. Rollback

1. Stop bad process if needed  
2. Redeploy last known-good commit  
3. Reverse migration only with explicit plan  
4. Report failure + cause  

No force-push to main/master unless explicitly requested.

---

## 9. Release Report template

```markdown
## Release Report — <feature / version>

### Objective
…

### North Star
How this helps create Qualified Buyers: …

### Business Goal
Lead | Sales | Campaign | Knowledge | Publishing | Automation

### Classification
Core | Business | Infrastructure | Experimental

### KPI Pyramid tier
Scanner | Finding | Lead | Qualified Buyer | Negotiation | Closed Won | Revenue

### Architecture
Module / Bounded Context / Reuse / ADR refs

### Impact Analysis

| Affected Modules | Not Affected Modules |
|------------------|----------------------|
| … | Runtime |
| … | Fleet |
| … | Browser |
| … | Queue |
| … | Scheduler |

### Runtime Impact
none | <what/why/risk/rollback>

### Deliverables
- Commits: `<sha> <message>`
- APIs / UI / Telegram: …

### Tests
- Scenario:
- Coverage:
- Result:

### Cleanup / Clean Repository
- Test data removed: …
- Dead docs/scripts/APIs: …
- Temp scripts / expired flags: …

### Known Issues
…

### Technical Debt / Next
…

### AI Self Review
- Went well:
- Weakness:
- Risk:
- Confidence:
```

---

## 10. Post-release

- Health still green after soak  
- ADR updated if architecture changed (Constitution untouched unless Philosophy/Principles)  
- Evolution log line when sprint closes  
- Release Quality Gate closed — any miss = **NOT DONE**  

---

## 11. Hotfix

May shorten design prose; **may not** skip Impact, Cleanup, Health, Protected-boundary respect, Quality Gate essentials, or Report essentials.
