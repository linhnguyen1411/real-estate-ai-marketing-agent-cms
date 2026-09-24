# Browser Destination Framework (Phase C4)

**Date:** 2026-07-16  
**Status:** Completed (refactor only, no behavior change intended)

## Goal

Extract shared browser destination logic from `FacebookTimelineAdapter` into a generic base framework so future platforms only implement strategy/selectors, without duplicating browser utilities.

## New Generic Framework

- Added `server/modules/social-publishing/browser/adapters/genericBrowserDestinationAdapter.ts`

### Extracted shared concerns

- navigation helpers
- editor workflow scaffolding
- media upload helpers
- waiting/retry utilities
- evidence capture
- error mapping
- browser/runtime utilities (page factory, lock handling, per-job state)

## Timeline Adapter After Refactor

- `server/modules/social-publishing/browser/adapters/facebookTimelineAdapter.ts` now keeps only:
  - selector map
  - timeline-specific auth check
  - compose strategy
  - publish strategy
  - verify strategy

All shared implementation moved to `GenericBrowserDestinationAdapter`.

## Registry Integration

- `destinationRegistry.ts` now registers singleton `facebookTimelineAdapter`
- runtime injection continues through:
  - `configureFacebookTimelineAdapterRuntime(...)`

## Behavior and Scope Guard

- No Mission Runtime changes
- No Worker Runtime architecture changes
- No Queue changes
- No Scanner changes
- No new platform implementation
- No API contract change

## Platform Extension Contract

New destination adapters only need to implement:

- selector map
- compose strategy
- publish strategy
- verify strategy

Everything else is inherited from the generic framework.
