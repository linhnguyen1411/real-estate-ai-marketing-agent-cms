# Project Structure

Canonical layout for `real-estate-ai-marketing-agent-cms`.  
Companion to [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) **v2**.

---

## Top level

```text
server.ts                 # HTTP bootstrap (keep thin)
server/                   # Backend — APIs, workers, modules
src/                      # Frontend React (CMS shell + Agent Platform)
prisma/                   # Schema + migrations
shared/                   # Shared types/helpers
scripts/                  # Ops/dev scripts (delete probes after use)
runtime/                  # Local runtime artifacts (do not commit junk)
docs/engineering/         # Constitution set
docs/adr/                 # Architecture Decision Records
public/                   # Static assets
```

---

## Workspaces (product contexts)

These are **Bounded Contexts** for Architecture First. UI hubs and modules map into them.

| Workspace | Responsibility | Primary modules / UI | Not responsible for |
|-----------|----------------|----------------------|---------------------|
| **Campaign Workspace** | Living campaigns: plan → research → mission → content → approval → optimize | `planning/`, Campaign Center, execution-trace | Fleet, Browser lease |
| **Lead Workspace** | Detect / decide / qualify buyers & candidates | `lead-acquisition/`, `decision-center/`, Lead hub | Publisher click path |
| **Sales Workspace** | Journey, pipeline value, expected revenue, follow-up | `sales-layer/`, Lead Center (sales views) | Scanner execution |
| **Knowledge Workspace** | Concepts, rules, learning, feedback, coverage | `knowledge-base/`, Knowledge hub | Runtime ops |
| **Publishing Workspace** | Drafts, schedule, channels, publish jobs | `social-publishing/` (+ Admin publishing pages) | Campaign planning logic |
| **Executive** | CEO command center: summary, KPIs, insights, actions | `executive-dashboard/`, `/admin/dashboard`, Executive hub | CPU/RAM/queue dumps |
| **Operations** | Operator surfaces over fleet/jobs/sessions/reports | Ops hub → Runtime Monitor, Jobs, Sessions | Fake business KPIs |
| **Runtime** | Execution substrate: workers, fleet, queue, browser, scheduler | `agent-worker/`, control-plane fleet/runtime, scheduler | Product philosophy / CRM |

**Rule:** Campaign is the center of AI Sales Employee work. Runtime exists to execute — not to define business goals.

---

## Backend (`server/`)

### Entry & cores

| Path | Responsibility |
|------|----------------|
| `server.ts` | Express wiring, auth, route registration |
| `server/prisma.ts` | Prisma client |
| `server/agent/` | Agent admin DB helpers, scheduler tick (**Protected** when changing job cores) |
| `server/agent-worker/` | Worker execution (**Protected Runtime**) |
| `server/automation-agent/` | Automation agent process |
| `server/agentIngest/` | Remote ingest |

### Product modules (`server/modules/`)

Public API via `index.ts`. No deep cross-imports.

| Module | Owns | Workspace |
|--------|------|-----------|
| `planning/` | AI Sales Employee, living campaigns, planners | Campaign |
| `execution-trace/` | Telegram→Campaign traces + analytics | Campaign / Executive |
| `executive-dashboard/` | Executive snapshot + main Dashboard KPIs | Executive |
| `control-plane/` | Telegram, Copilot, commands, ops metrics, fleet views | Operations / Runtime (fleet protected) |
| `social-publishing/` | Drafts, channels, publish jobs, publishers | Publishing (**Publisher Runtime protected**) |
| `mission-engine/` | Mission workflow steps | Runtime-adjacent / Scanner paths protected |
| `lead-acquisition/` | Buyer acquisition profiles | Lead |
| `sales-layer/` | Pipeline / journey / revenue metrics | Sales |
| `decision-center/` | Rule-first decisions | Lead |
| `knowledge-base/` | Concepts, learning, feedback | Knowledge |
| `ai-gateway/` | Multi-provider AI routing | Cross-cutting capability |
| `marketing-org/` | Content packs, calendar, marketing health | Campaign / Publishing advisory |
| `automation-engine/` | Automation workflows | Automation |
| `link-normalization/` | URL normalize/verify | Shared |

### Control-plane sensitive subpaths

| Subpath | Notes |
|---------|-------|
| `fleet/`, `fleet-orchestrator/` | **Protected Fleet** |
| `telegram/` | Transport; business in handlers/planning |
| `copilot/` | Intent → façades |
| `command-engine/` | Slash commands |

---

## Frontend (`src/`)

| Path | Responsibility |
|------|----------------|
| `src/App.tsx` | CMS shell + Executive Dashboard host |
| `src/pages/AgentPlatformPage.tsx` | Hubs: Executive · Marketing · Lead · Sales · Operations · Knowledge |
| `src/features/agent/*` | Agent feature pages |
| `src/features/dashboard/` | `/admin/dashboard` Command Center |
| `src/services/api.ts` | CMS API client |

### Hub → Workspace mapping

| Hub | Workspace focus |
|-----|-----------------|
| Executive | Executive |
| Marketing | Campaign + Publishing |
| Lead | Lead |
| Sales | Sales |
| Operations | Operations / Runtime views |
| Knowledge | Knowledge |

---

## Dependency rules

```text
UI / Telegram adapters
        ↓
Module public API (index.ts)
        ↓
Module services / stores
        ↓
Prisma / AppSetting / ports
```

**Forbidden:** UI→worker internals; Planning→Publisher click impl; Executive mutate Fleet; circular façades.

**Allowed:** Compose-read metrics; Copilot→`runSalesEmployee`; Trace summaries (no full prompts).

---

## Where new code goes

| Building… | Put in… |
|-----------|---------|
| Campaign AI lifecycle | `planning/` (Campaign Workspace) |
| Buyer qualification | `decision-center/` / `lead-acquisition/` |
| Pipeline/revenue | `sales-layer/` |
| Knowledge/learning | `knowledge-base/` |
| CEO KPIs | `executive-dashboard/` + dashboard UI |
| Publish execute | `social-publishing/` (mission must allow) |
| Large design choice | `docs/adr/ADR-xxx-….md` |
| Probe | `scripts/` then delete |

---

## Data stores

| Store | Use |
|-------|-----|
| PostgreSQL / Prisma | Entities |
| AppSetting JSON | Module state (knowledge, decision, traces, …) |
| `runtime/` | Dev artifacts — keep out of git |

---

*Update this map in the same PR when modules/workspaces change.*
