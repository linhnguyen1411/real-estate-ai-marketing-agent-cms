# Project Structure

Canonical layout for `real-estate-ai-marketing-agent-cms`.  
Companion to [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md).

---

## Top level

```text
server.ts                 # HTTP bootstrap (register routes; keep thin)
server/                   # Backend Node/TS — APIs, workers, modules
src/                      # Frontend React (CMS Admin + Agent Platform)
prisma/                   # Schema + migrations
shared/                   # Cross-cutting types/helpers shared by server+src
scripts/                  # Ops/dev scripts (must not become hidden product logic)
runtime/                  # Local runtime artifacts / profiles (do not commit junk)
data/                     # Local data dumps (gitignored as appropriate)
docs/engineering/         # This constitution set
public/                   # Static assets
```

---

## Backend (`server/`)

### Entry & cores

| Path | Responsibility |
|------|----------------|
| `server.ts` | Express app wiring, auth shell, route registration |
| `server/prisma.ts` | Prisma client |
| `server/agent/` | Agent admin DB helpers, scheduler tick (Protected when changing job cores) |
| `server/agent-worker/` | Local/remote worker execution (Protected Runtime) |
| `server/automation-agent/` | Automation agent process |
| `server/agentIngest/` | Ingest credentials / remote agent ingest |

### Product modules (`server/modules/`)

Each module exposes a public façade via `index.ts`. Prefer importing from the façade.

| Module | Owns | Must not become |
|--------|------|-----------------|
| `planning/` | AI Sales Employee, Campaign Runtime (living campaigns), planners, Telegram cards | Publisher/Scanner executor |
| `execution-trace/` | Telegram→Campaign execution traces + analytics | Runtime debugger |
| `executive-dashboard/` | Executive snapshot + main Dashboard KPIs (compose-only) | Ops fleet UI |
| `control-plane/` | Telegram console, Copilot, command-engine, ops metrics, fleet views | Business lead rules |
| `social-publishing/` | Drafts, channels, publish jobs, browser publishers (Protected publish cores) | CRM |
| `mission-engine/` | Mission workflow steps / registry | CMS pages |
| `lead-acquisition/` | Buyer intent / acquisition profiles | Browser lease |
| `sales-layer/` | Pipeline, journey, expected revenue metrics | Queue cores |
| `decision-center/` | Rule-first lead decisions + metrics | AI gateway internals |
| `knowledge-base/` | Concepts, learning, feedback, analytics | Runtime |
| `ai-gateway/` | Multi-provider AI routing | Prompt dump in UI |
| `marketing-org/` | Content packs, calendar, marketing health | Publisher click path |
| `automation-engine/` | Automation workflows | — |
| `link-normalization/` | URL normalize/verify | — |

### Control-plane sub-areas (sensitive)

| Subpath | Notes |
|---------|-------|
| `control-plane/fleet/` | Protected Fleet |
| `control-plane/fleet-orchestrator/` | Placement / drain policies — Protected |
| `control-plane/telegram/` | Transport only; business in handlers/planning |
| `control-plane/copilot/` | Intent classification + handlers |
| `control-plane/command-engine/` | Slash commands (`/dashboard`, `/trace`, `/ops`, …) |

---

## Frontend (`src/`)

| Path | Responsibility |
|------|----------------|
| `src/App.tsx` | Core CMS shell (login, tabs, Executive Dashboard host) |
| `src/pages/AgentPlatformPage.tsx` | Agent hubs: Executive / Marketing / Lead / Sales / Operations / Knowledge |
| `src/features/agent/*` | Agent feature pages (Campaign Center, Knowledge, Runtime Monitor, …) |
| `src/features/dashboard/` | Main `/admin/dashboard` Executive Command Center UI |
| `src/services/api.ts` | CMS API client + Dashboard types |
| `src/components/agent/` | Legacy/shared agent widgets (prefer features/ going forward) |

### Admin navigation intent

| Hub | Business purpose | Not for |
|-----|------------------|---------|
| **Executive** (`/admin/agents`, `/admin/dashboard`) | CEO: AI status, buyers, pipeline, recommendations | CPU/RAM dumps |
| **Marketing** | Campaign, publishing, calendar/ROI | Fleet |
| **Lead** | Decision, candidates, scanned | Browser leases |
| **Sales** | Pipeline / journey / revenue | Queue internals |
| **Operations** | Runtime / Fleet / Jobs / Sessions | Fake business KPIs |
| **Knowledge** | Concepts, analytics, feedback | Publisher |

---

## Dependency rules

```text
UI / Telegram adapters
        ↓
Module public API (index.ts)
        ↓
Module services / stores
        ↓
Prisma / AppSetting / external ports
```

**Forbidden**

- Feature UI importing worker internals
- Planning importing Publisher click implementations
- Executive compose layer mutating Fleet state
- Circular module imports without a façade

**Allowed**

- Compose modules reading metrics from sales / decision / knowledge / ops **snapshots**
- Copilot calling `runSalesEmployee` / planning façades
- Trace module recording summaries (no full prompts)

---

## Where new code goes

| If you are building… | Put it in… |
|----------------------|------------|
| New business capability | `server/modules/<name>/` + Admin feature page |
| Telegram slash command | `control-plane/command-engine/` (+ optional Copilot intent) |
| CEO dashboard metric | `executive-dashboard/` compose + `src/features/dashboard/` |
| Campaign AI lifecycle | `planning/` (not Runtime) |
| Publish to social | `social-publishing/` (Protected — mission must allow) |
| One-off probe | `scripts/` then **delete** after cleanup |

---

## Data stores

| Store | Use |
|-------|-----|
| PostgreSQL via Prisma | Entities: jobs, findings, campaigns, drafts, publish jobs |
| `AppSetting` JSON keys | Module state (knowledge, decision metrics, traces, …) |
| `runtime/` local profiles | Dev browser/CDP artifacts — keep out of git commits |

---

*Keep this file aligned with the repo. When modules are added/renamed, update this map in the same PR.*
