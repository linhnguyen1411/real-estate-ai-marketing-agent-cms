# Technical Debt (H0.1)

## Hotspots

| Item | Severity | Notes |
|------|----------|-------|
| `server.ts` ~3.2k LOC | High | Split routes/bootstrap post-v0.9 |
| `agentRoutes.ts` ~1.6k LOC | High | Admin API surface |
| `App.tsx` ~1.5k LOC | Medium | Frontend still coupled |
| Dual publish handlers | Medium | Mission vs stateless — intentional G1; document only |
| Graph leftover | Medium | Flag-off; remove after one stable release cycle |
| Deprecated UI barrels | Low | `src/components/agent/*` |
| Script sprawl | Low | `tmp-vps-*`, `_smoke-*` |
| Dual `facebookGroupAdapter` names | Low | Scan vs publish — different folders |

## Deprecated flows (keep until H1+)

1. Facebook Graph publisher (`docs/publishing/GRAPH-PUBLISHER-DEPRECATION.md`)
2. Legacy mission templates merged into registry
3. Facebook CMS panel / routes behind flags

## Explicit non-goals for H0

- No schema redesign
- No rewrite of Mission / Pool / Browser / Fleet engines
- No new marketing features

## Accepted risks for v0.9

- Video publish = **Experimental** (disabled)
- In-memory orchestrator policies/reservations reset on CMS restart (payload ownership persists on jobs)
- Claude provider not implemented (Gemini/OpenAI/Ollama only)

## H0 burn-in findings (tracked)

| Item | Severity | Notes |
|------|----------|-------|
| Live hydrate gate | Medium | `dryRun` set on **VPS** via `BROWSER_PUBLISH_LIVE` — agent-local alone is insufficient |
| Dual execution processes | High | `agent-worker` + `automation-agent` → claim/CDP storm; ops must run one |
| Channel URL split | Medium | Admin `profileUrl` vs empty `config` — hydrated in H0 bugfix |
| Group verify heuristics | Medium | Soft-success improved; Timeline remains primary burn-in path |
| `pg_dump` + `?schema=` | Low | Strip Prisma query param for durable DB backups |
