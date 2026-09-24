# Automation Engine (Phase C6)

**Date:** 2026-07-17  
**Status:** Facade foundation complete

## Goal

Unify Scan, Publish, and future browser actions under one **Automation Engine** discovery surface. This phase is a **facade + registries only** — no production behavior change.

## Architecture

```
Automation Engine
├── Mission Runtime      → server/modules/mission-engine (unchanged)
├── Worker Runtime       → server/agent-worker (unchanged)
├── Browser Runtime      → BrowserManager (unchanged)
├── Destination Registry → wraps social-publishing/browser/destinationRegistry
├── Action Registry      → wraps social-publishing/browser/actions
└── Workflow Registry    → NEW catalog (scan-content, publish-content, …)
```

## Workflow Registry

Every automation workflow is registered here. No hardcoding of “scan” vs “publish” at the engine catalog layer.

| Key | Kind | Status |
|-----|------|--------|
| `scan-content` | scan | **Implemented** (existing scan → content workflow path) |
| `publish-content` | publish | **Implemented** (Mission publish + PublishAction) |
| `auto-comment` | action | Stub — register later |
| `auto-message` | action | Stub |
| `auto-follow` | action | Stub |
| `auto-invite` | action | Stub |
| `auto-react` | action | Stub |

To add a new workflow later: implement action/destination pieces as needed, then `WorkflowRegistry.register(...)`.

## Code Map

- `server/modules/automation-engine/types.ts` — workflow keys + registration shape
- `server/modules/automation-engine/workflowRegistry.ts` — WorkflowRegistry
- `server/modules/automation-engine/actionRegistryFacade.ts` — ActionRegistry
- `server/modules/automation-engine/destinationRegistryFacade.ts` — DestinationRegistry
- `server/modules/automation-engine/automationEngine.ts` — `AutomationEngine` facade
- `server/modules/automation-engine/index.ts` — public exports

## What Did Not Change

- Mission Runtime / templates / step executors
- Worker Runtime / job dispatch
- Queue
- HTTP APIs
- Scanner core
- Publish business logic / Destination adapters / Action implementations
- No new platforms or actions

## Usage (discovery only)

```ts
import { AutomationEngine } from '@/server/modules/automation-engine';

AutomationEngine.describe();
AutomationEngine.resolveWorkflow('publish-content', { requireImplemented: true });
AutomationEngine.workflows.listImplemented();
AutomationEngine.actions.list();
AutomationEngine.destinations.list();
```

Execution still flows through existing Mission / Worker / Publish paths. The engine catalogs what exists; it does not re-route jobs in C6.
