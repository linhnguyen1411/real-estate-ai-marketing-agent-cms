# Repository Inventory — feature/refactor @ 72d9eb6

> 2026-07-14. Status/action = recommendations. Broker public `agentApi` ≠ AI Employee `agentPlatformApi`.

## Mounts (`server.ts`)

| Mount | Module | Status | Action |
|-------|--------|--------|--------|
| `/webhooks/facebook` | facebookRoutes | active legacy | keep |
| Blog / short-link / investor | respective routes | active | keep |
| `/api/agent/*` | agentRoutes | active | keep |
| `/api/agent-ingest/v1/*` | ingestRoutes | active | keep |
| Scheduler + outbox worker | bootstrap | active | keep |
| `npm run agent:worker` | agent-worker | active | keep |

## Frontend

| Path | Purpose | Status | Action |
|------|---------|--------|--------|
| `src/pages/AgentPlatformPage.tsx` + `components/agent/*` | AI Employee UI | active | keep |
| `src/services/agentPlatformApi.ts` | Admin API client | active | keep |
| `src/services/agentApi.ts` | Public broker | active | keep |
| `FacebookPanel` + `facebookApi` (client) | Unmounted Graph UI | legacy | deprecate |
| `main-new` / `ListingsPageNew` | Orphan entry | **removed R0** | deleted |

## Backend / worker

| Path | Status | Action |
|------|--------|--------|
| `server/agent/*` | active | keep |
| `server/agent-worker/*` | active | keep |
| `server/agentSync/*`, `agentIngest/*` | active | keep |
| `server/notifications/*` | active | keep |
| `server/dataLifecycle/*` | active | keep |
| Dual `contentNormalizer` | duplicate APIs | investigate R1 |
| `backend/app.*` | **archived** | docs/archive/backend |

## Database

Prisma agent + CMS models; migrations `20260630`–`20260713*` — **keep always**.

## Scripts

| Group | Status | Action |
|-------|--------|--------|
| `test:*` agent | active | keep |
| backfill / enqueue / diagnose | active | keep |
| `probe-*` / most `tmp-vps-*` | **archived** | docs/archive/scripts |
| `tmp-vps-safe-deploy.sh` | active ops | **keep** |
| `deploy.ps1` vs `deploy-safe.ps1` | risky vs safer | prefer safe; fix npm wire later |

## Runtime artifacts

| Path | Status | Action |
|------|--------|--------|
| `data/browser-profiles` ~109 MB | session | protect |
| `runtime/agent-browser-profile` | missing (CDP) | keep when created |
| allowlisted cleanup dirs | empty | cleanup script |

## Docs

`docs/AI-AGENT-*` + `docs/production/AGENT-*` active/ops; `docs/refactor/*` this phase; archived one-offs under `docs/archive/`.
