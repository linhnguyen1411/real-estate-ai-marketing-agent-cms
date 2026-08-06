# Facebook Group Publisher (Phase D3)

**Date:** 2026-07-17  
**Status:** Live-ready (`facebook_group`)

## Goal

Implement browser destination `facebook_group` by reusing Automation Engine, Mission / Worker / Browser runtimes, DOM Framework, and Action Framework. **No Timeline code copy** — only Group config + thin adapter.

## Architecture

```
Mission publish workflow
  → BrowserDestinationAdapter (facebook_group)
  → DomConfiguredDestinationAdapter (shared orchestration)
  → DomToolkit (Navigator / Editor / Uploader / Publisher / Verifier / Evidence)
  → facebookGroupConfig (selectors + flow + rules)
```

## Code Map

| File | Role |
|------|------|
| `facebookGroupConfig.ts` | **All** Group selectors, flow, permalink rules, `resolveFacebookGroupUrl` |
| `facebookGroupAdapter.ts` | Orchestration only: key, capabilities, `initialUrl`, auth |
| `domConfiguredDestinationAdapter.ts` | Shared upload/compose/publish/verify/evidence (Timeline + Group) |
| `destinationRegistry.ts` | Registers live `facebookGroupAdapter` |

## Open Group

`initialUrl` resolves from `destinationConfig`:

1. `groupUrl`
2. `url`
3. `profileUrl`
4. `pageUrl`

Throws if none present.

## Lifecycle

Same Dom Framework phases as Timeline:

prepare → navigate (group URL) → auth → upload (multi-image) → compose → publish → verify → evidence → cleanup

## Scope Guard

Reused unchanged:

- Automation Engine
- Mission Runtime
- Worker Runtime
- Browser Runtime
- DOM Framework
- Action Framework

Not implemented: new platforms beyond Group.

## Tests

```bash
npm run test:facebook-group
npm run test:facebook-timeline
npm run test:social-publishing
npm run test:mission-engine
npm run lint
```
