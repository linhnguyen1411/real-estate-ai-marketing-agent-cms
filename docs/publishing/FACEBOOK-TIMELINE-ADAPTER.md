# Facebook Timeline Adapter — Live (Phase D1)

**Date:** 2026-07-17  
**Status:** Live-ready (`facebook_timeline`)

## Goal

Complete the `facebook_timeline` browser publisher for real posts: compose, multi-image upload, publish, verify, permalink, evidence, and retry. **No Graph API.**

## Scope Guard

Unchanged:

- Automation Engine
- Mission Runtime
- Worker Runtime
- Destination / Action / Workflow registries

Changed:

- `server/modules/social-publishing/browser/adapters/facebookTimelineAdapter.ts`
- `server/modules/social-publishing/browser/adapters/facebookTimelineDom.ts` (DOM helpers)

## Lifecycle

| Phase | Behavior |
|-------|----------|
| `prepare` | Evidence paths + timer |
| `navigate` / `ensureAuthenticated` | Home URL + Facebook auth block detect |
| `uploadMedia` | Open composer → attach **all** local images (file input / chooser) with retry |
| `fillContent` | Open/focus composer → type body + link with retry |
| `publish` | Click Post/Đăng with retry → success heuristics → permalink |
| `verify` | Re-check success / permalink / postId |
| `captureEvidence` | Before/after screenshots, HTML snapshot, permalink, postId |
| `cleanup` | Dismiss dialogs + release CDP lock |

## Permalink

Extracted from feed/dialog links matching:

- `/posts/{id}`
- `permalink.php?story_fbid=`
- `story.php?story_fbid=`
- `/activity/{id}`

## Runtime

Reuses injected Browser Runtime (`BrowserManager.getPublishPage` / CDP locks) via `configureFacebookTimelineAdapterRuntime`.

## Tests

```bash
npm run test:facebook-timeline
npm run test:social-publishing
npm run lint
```
