# Mission Registry Unification (Phase C1)

**Date:** 2026-07-16  
**Status:** Implemented incrementally with backward compatibility

## Goal

Unify mission template registration so scan and publish templates are both registered from one official source, without changing business logic, API contracts, workflow runtime, scanner internals, or browser runtime.

## Changes

- Added unified registry: `server/modules/mission-engine/domain/missionRegistry.ts`
  - Registers and lists:
    - `workflow_v2` templates (including publish template)
    - `legacy_v1` templates (scan-oriented)
  - Exposes typed lookups for both groups.
- Moved legacy template data into mission-engine domain:
  - `server/modules/mission-engine/domain/legacyMissionTemplates.ts`
- Kept backward compatibility facade:
  - `server/agent/missionTemplates.ts` now re-exports from `legacyMissionTemplates.ts`
  - Existing import paths/API behavior unchanged.
- No changes to scanner runtime, worker runtime, browser runtime, or DOM/Playwright logic.

## Compatibility Guarantees

- Legacy API route behavior remains unchanged:
  - `GET /api/agent/missions/templates` still returns workflow + legacy template entries.
  - `POST /api/agent/missions/from-template` still supports both workflow and legacy template creation paths.
- Existing function names in `server/agent/missionTemplates.ts` are preserved.
- No migration/rewrite required.

## Validation Checklist

- [x] Single official registry exists (`missionRegistry.ts`)
- [x] Publish template is registered in the unified registry
- [x] Legacy scan templates are registered in the unified registry
- [x] Backward compatibility facade retained
- [x] No scanner/browser runtime changes

## Test Plan (Phase C1)

- Registry registration:
  - `scripts/test-mission-registry-unification.ts`
- Existing mission tests:
  - `npm run test:mission-engine`
- Lint:
  - `npm run lint`
- Build:
  - `npm run build`

## Execution Results

- `npm run test:mission-engine` ✅ pass (12 assertions)
- `npx tsx scripts/test-mission-registry-unification.ts` ✅ pass
- `npm run lint` ✅ pass (`tsc --noEmit`)
- `npm run build` ⚠️ blocked by local Prisma engine file lock:
  - `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
  - This is an environment/process lock issue, not a registry logic/runtime change.
