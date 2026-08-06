# Automation Action Framework (Phase C5)

**Date:** 2026-07-17  
**Status:** Framework complete (Publish wired; other actions registered as stubs)

## Goal

Generalize browser automation beyond Publish. Publish is **one Action** among many. Destination adapters no longer own publish orchestration — they supply selectors, navigation, and capabilities. Actions decide the operation.

## Architecture

```
Mission Workflow Steps (unchanged)
        ↓
BrowserDestinationAdapter (compat facade)
        ↓
PublishAction (AutomationAction)
        ↓
DestinationActionHost (selectors + nav + DOM strategies)
        ↓
BrowserManager.getPublishPage()
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| **AutomationAction** | `prepare` → `execute` → `verify` → `captureEvidence` → `cleanup` |
| **DestinationActionHost** | selectors, navigate, auth, page, wait/retry, evidence utilities, platform DOM strategies |
| **BrowserDestinationAdapter** | Backward-compatible facade; publish phases delegate to `PublishAction` |

## Registered Actions

| Key | Label | Status |
|-----|-------|--------|
| `publish` | Publish | **Implemented** (bound when destination adapter constructs) |
| `comment` | Comment | Stub (not implemented) |
| `reply` | Reply | Stub |
| `react` | React | Stub |
| `join_group` | Join Group | Stub |
| `follow` | Follow | Stub |
| `invite` | Invite | Stub |
| `message` | Message | Stub |

## Code Map

- `browser/actions/types.ts` — `AutomationAction` contract
- `browser/actions/destinationActionHost.ts` — host surface for destinations
- `browser/actions/publishAction.ts` — PublishAction (upload / compose / publish)
- `browser/actions/stubs.ts` — stub actions
- `browser/actions/actionRegistry.ts` — registry
- `browser/adapters/genericBrowserDestinationAdapter.ts` — destination utilities + PublishAction wiring
- `browser/adapters/facebookTimelineAdapter.ts` — selectors + timeline DOM strategies only

## Behavior Preservation

- Mission Runtime / workflow steps unchanged
- Worker Runtime / Queue unchanged
- Existing `BrowserDestinationAdapter` method signatures unchanged
- Publish path: adapter methods → `PublishAction` → host strategies

## Future Platforms / Actions

New destination: implement `DestinationActionHost` strategies + selector map.  
New action: implement `AutomationAction`, register in `actionRegistry` — no need to duplicate browser utilities.
