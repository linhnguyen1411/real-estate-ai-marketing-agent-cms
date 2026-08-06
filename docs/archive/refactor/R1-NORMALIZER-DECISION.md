# R1 Normalizer Decision

**Date:** 2026-07-14  
**Commit baseline:** R1 domain consolidation

## Verdict

**Keep both implementations.** They serve different purposes. Do **not** merge in R1. Do **not** change hash internals (would invalidate `dedupeVersion` / stored hashes).

| Module | Path | Purpose-explicit name | Used for |
|--------|------|------------------------|----------|
| A | `server/agent/dedup/contentNormalizer.ts` | `normalizeContentForDedup` (= `normalizeLeadContent`) | Lead Intelligence **exact-content dedupe** hash (`CONTENT_DEDUPE_VERSION = lead-dedupe@v1`) |
| B | `server/agent-worker/services/contentNormalizer.ts` | `normalizeTextForMatching` / `normalizeTextForDisplay` (= `normalizeText`) | Website/Facebook **scrape** sanitize, URL safety, page body truncate, scrape content hash |

## Differences (intentional)

| Concern | Dedup (A) | Scrape (B) |
|---------|-----------|------------|
| Unicode | NFKC + lower + strip FB chrome labels | sanitizeUnicodeString; whitespace collapse |
| Emoji | Strip edge emoji heavily | Keep more content |
| Phone/money | Preserve digits intentionally | Not specialized |
| URL | N/A | `assertSafePublicUrl`, canonical URL |
| Max length | Implicit via normalize | Explicit maxLength (default 50k) |
| Hash | `hashNormalizedContent(text)` | `computeContentHash(url, body)` |

## Callers

- **A:** `findingDedupService` and related lead dedupe paths.
- **B:** website adapter, `contentRepository`, FB/website scrape pipeline.

## R1 actions taken

- Documented purpose headers on both files.
- Added aliases `normalizeContentForDedup`, `normalizeTextForMatching`, `normalizeTextForDisplay`.
- Left original export names for compatibility.
- **No** hash algorithm change.

## Later phases

- R3+: optional migrate callers to purpose names only, then deprecate old names when caller graph is empty.
- Never invalidate `lead-dedupe@v1` without a versioned rehash migration plan.
