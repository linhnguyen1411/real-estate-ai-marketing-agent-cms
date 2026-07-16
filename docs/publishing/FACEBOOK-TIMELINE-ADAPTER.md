# Facebook Timeline Adapter (Phase C3)

**Date:** 2026-07-16  
**Status:** Implemented (`facebook_timeline`)

## Scope

Implemented first real `BrowserDestinationAdapter` for `facebook_timeline` with DOM lifecycle logic contained in adapter module only.

No changes made to:

- Mission Runtime
- Queue design
- Worker Runtime architecture
- Scanner
- Browser Runtime internals
- Graph API usage

## Adapter Implementation

- File: `server/modules/social-publishing/browser/adapters/facebookTimelineAdapter.ts`
- Registered in destination registry:
  - `server/modules/social-publishing/browser/destinationRegistry.ts`

### Lifecycle Coverage

- `prepare()`
- `navigate()`
- `ensureAuthenticated()`
- `fillContent()` (compose phase implementation lives inside adapter)
- `uploadMedia()`
- `publish()`
- `verify()`
- `captureEvidence()`
- `cleanup()`

## Runtime Reuse

Adapter reuses existing worker browser runtime via injected page factory:

- `BrowserManager.getPublishPage()`
- `BrowserManager.beginCdpJob()`
- `BrowserManager.releaseCdpLock()`

Injection point:

- `server/modules/social-publishing/worker/publishSocialHandler.ts`

Worker still only orchestrates workflow execution; DOM selectors are confined to adapter implementation.

## Evidence

Adapter captures and returns:

- screenshot before
- screenshot after
- html snapshot
- published url (when available)
- latency/duration

Paths are aligned with publish evidence structure under `runtime/publish-evidence`.

## Tests

- Adapter tests:
  - `scripts/test-facebook-timeline-adapter.ts`
- Existing publishing tests:
  - `npm run test:social-publishing`
- Mission tests:
  - `npm run test:mission-engine`
- Lint:
  - `npm run lint`
- Build:
  - `npm run build` (environment-dependent due to local Prisma DLL lock)
