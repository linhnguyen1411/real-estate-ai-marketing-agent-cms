# ADR: Centralized SEO Engine

**Status:** Accepted  
**Date:** 2026-08-06  
**Branch:** `feature/seo-engine-refactor`

## Context

SEO title, description, canonical, robots, OG/Twitter, and schema *selection* were scattered across `pageMeta`, `siteConfig`, `SeoHead`, SSR `seoPublicRoutes`, and ad-hoc helpers. That made SSR vs CSR drift likely.

## Decision

Introduce `src/seo/engine` + `registry` + `types` + `utils` as the single composition layer:

- `resolveSeo()` is the public entry
- `buildTitle` / `buildDescription` / `normalizeCanonical` own generation primitives
- `seoRouteRegistry` owns static route metadata (values migrated from `pageMeta`)
- Schema resolvers return **type labels only** (no JSON-LD rewrite)

Existing emitters (`SeoHead`, `renderIndexWithMeta`) stay unchanged in this phase.

## Consequences

- `pageMeta` and SSR share-meta helpers delegate into the engine
- Historical SSR home `DEFAULT_SEO_*` strings remain via overrides (still diverge from `SITE.default*` until a later content phase)
- No routing, React, or HTML-injection changes in this ADR

## Rollback

Revert this branch; callers still expose the same `PageMeta` / share-meta shapes.
