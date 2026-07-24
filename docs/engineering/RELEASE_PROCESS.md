# Release Process

Official ship path for this project.  
Parent: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md).

---

## 1. Pre-release gate

Do not deploy until:

1. Constitution checklist passed ([CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md))
2. Commit(s) created as requested (no drive-by commits)
3. Tests recorded with **Scenario / Coverage / Result**
4. Test data cleaned from the target environment
5. No-Impact Declaration written
6. Rollback idea known (previous commit SHA / prior artifact)

---

## 2. Build

```bash
# Install if needed
npm install

# Typecheck / build as used by the team
npx tsc --noEmit -p tsconfig.json
npm run build
```

Fix build failures before deploy. Do not skip type errors with “ship anyway”.

---

## 3. Migration

If Prisma schema changed:

```bash
npx prisma migrate deploy
# or project-standard migrate command
```

- Review migration SQL
- Never edit applied production migrations in place
- Backup before prod migrate

---

## 4. Backup (production)

Before production cutover:

- DB snapshot / dump
- Note current release commit / tag
- Confirm who can authorize rollback

Local/dev: optional, but keep probes reversible.

---

## 5. Deploy

| Environment | Typical action |
|-------------|----------------|
| Local CMS | Restart `npm run dev` (or agreed free-port + start) |
| Staging/Prod | Follow ops runbook / host process manager |

Deploy only the intended commit. Do not mix unrelated dirty trees (runtime profiles, `.env`).

---

## 6. Health

```bash
# Example
curl -sS http://127.0.0.1:3000/api/health
```

Expect success / HTTP 200. If health fails → stop and rollback.

---

## 7. Smoke Test (mandatory)

Document:

| Field | Fill in |
|-------|---------|
| Scenario | … |
| Coverage | … |
| Result | … |
| Env | branch / URL / time |

Minimum smoke sets by change type:

| Change type | Smoke |
|-------------|-------|
| Executive Dashboard | `/admin/dashboard` loads KPIs; refresh; drill-down |
| Campaign / Trace | Create or open campaign; Trace timeline; `/trace` |
| Telegram command | Intended slash command reply shape |
| Protected Runtime (authorized) | Ops path named in mission only |

---

## 8. Rollback

If smoke/health fails:

1. Stop traffic / stop bad process if needed  
2. Redeploy previous known-good commit  
3. Reverse migration only with explicit plan  
4. Report failure + root cause  

Never `push --force` to main/master unless explicitly requested.

---

## 9. Release Report template

```markdown
## Release Report — <feature / version>

### Objective
…

### Architecture
…

### Deliverables
- Commits: `<sha> <message>`
- APIs / UI / Telegram: …

### Impact
…

### No-Impact Declaration
Runtime · Fleet · Queue · Browser · Publisher · Scheduler · … 

### Tests
- Scenario:
- Coverage:
- Result:

### Cleanup
- Test data removed: yes/no (list)
- Temp scripts removed: yes/no

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

- Confirm health still green after soak (scheduler ticks, no error storm)
- Update docs if behavior changed
- Close the mission with Definition of Done (Constitution §16)

---

## 11. Hotfix exception

Hotfixes still follow Constitution. Allowed compressions:

- Shorter design writeup  
- Focused smoke only  

**Not** allowed to skip: cleanup, health, no-impact, protected-boundary respect.
