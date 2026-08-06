# DOM Framework (Phase D2)

**Date:** 2026-07-17  
**Status:** Complete (refactor only — no behavior change intended)

## Goal

Extract all shared DOM interaction into a reusable framework. Destination adapters keep only **selectors**, **flow config**, and **platform rules**.

## Architecture

```
FacebookTimelineAdapter
  ├── selector map / flow / platform rules
  └── DomToolkit
        ├── DomNavigator   (open/find composer, dismiss dialogs)
        ├── DomEditor      (type/fill body + link)
        ├── DomUploader    (multi-file input / chooser)
        ├── DomPublisher   (click Post/Publish)
        ├── DomVerifier    (signals, permalink, success heuristics)
        └── DomEvidence    (screenshots, HTML snapshot)
```

## Code Map

| Module | Path |
|--------|------|
| Types + defaults | `browser/dom/types.ts` |
| Toolkit | `browser/dom/toolkit.ts` |
| Navigator | `browser/dom/DomNavigator.ts` |
| Editor | `browser/dom/DomEditor.ts` |
| Uploader | `browser/dom/DomUploader.ts` |
| Publisher | `browser/dom/DomPublisher.ts` |
| Verifier | `browser/dom/DomVerifier.ts` |
| Evidence | `browser/dom/DomEvidence.ts` |
| FB Timeline config | `browser/adapters/facebookTimelineConfig.ts` |
| FB Timeline adapter | `browser/adapters/facebookTimelineAdapter.ts` |

## Adapter Contract

A destination implements:

1. **`DomSelectorConfig`** — CSS / role / aria selectors (single source of truth)
2. **`DomFlowConfig`** — timeouts, waits, retry counts
3. **`DomPlatformRules`** — permalink/postId patterns + success/recovery parsers
4. Thin orchestration calling `DomToolkit` (auth checks stay platform-specific)

No duplicated selector loops inside adapters.

## Scope Guard

Unchanged:

- Automation Engine
- Mission Runtime
- Worker Runtime
- Queue
- Destination / Action registries
- Publish business behavior (dry-run + live DOM semantics preserved)

No new platforms in this phase.

## Tests

```bash
npm run test:facebook-timeline
npm run test:social-publishing
npm run lint
```
