# ADR-008 — Module Boundaries, Route Splitting and the Single Auth Guard

**Status:** Accepted  
**Date:** 2026-11-03

## Context

The backend had drifted in three related ways:

1. Two authorization middlewares (`denyByDefaultGuard` and `rbacRouteGuard`) were composed
   ad hoc, producing divergent skip lists (for example `/api/agent/runtime` was
   authenticated by token but blocked by the permission gate).
2. Fourteen product modules had no `index.ts`, so `bootstrap/mountRoutes.ts` and runtime
   consumers imported internal files directly. Several modules were also imported through
   deep paths (`modules/<x>/api/...`, `modules/<x>/domain/...`).
3. `server/agent/agentRoutes.ts` was a 1,761-line file registering 62 endpoints, making
   review and ownership difficult.

## Decision

1. **One API authorization pipeline.** `apiAuthorizationGuard()` runs on `/api` and applies,
   in order:
   - machine bypass allowlist (public site, agent ingest, runtime, webhooks, license,
     health, public media);
   - permission gate (deny-by-default);
   - authentication plus role floor (`resolveRequiredRole` + `requireRole`).

   Legacy public paths such as `/api/blog/*` bypass the permission gate but still require
   authentication and the role floor. Machine paths bypass both intentionally.

2. **Every product module exposes a public API through `index.ts`.** Cross-module imports
   must use the barrel. Exceptions are protected runtime paths (`agent-worker`,
   `control-plane/fleet*`, publishers/browser, scheduler) and lazy dynamic imports inside
   those paths.

3. **Route files are split by domain.** `agentRoutes.ts` is now a thin orchestrator; handlers
   live in `server/agent/routes/*Routes.ts` grouped by resource. Shared guards live in
   `agentRouteHelpers.ts`.

4. **Response helpers are shared.** The identical `sendError` implementation that existed in
   15 files now lives in `server/utils/httpResponses.ts`.

5. **Viewing appointments are relational.** `ViewingAppointment` has a Prisma model,
   migration and backfill from legacy `CmsRecord` JSON. The service and routes operate on
   Prisma only and enforce tenant scope.

## Consequences

- Authorization behaviour is defined in one place and covered by route-registry tests.
- Module internals can change without touching consumers.
- Remaining deep imports in `agent-worker/jobClaimer.ts` and related protected runtime files
  are intentionally left until a dedicated façade change is approved (see ADR-006 and the
  Protected Runtime rule in the Engineering Constitution).
- Adding an endpoint now means adding it to a domain route file and, if restricted, to the
  RBAC matrix.
