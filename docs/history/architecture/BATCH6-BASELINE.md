# BATCH 6 — Baseline

**Branch:** `feature/performance-cms-loading`  
**Commit:** `36f6433`  
**Status:** clean at start  
**Verify:** architecture / lint / build — PASS

## Metrics

| Metric | Value |
|--------|------:|
| App.tsx LOC | 1,608 |
| non-blank | 1,482 |
| useState | 27 |
| useEffect | 9 |
| handle* | 9 |
| PropertiesPage LOC / nb | 1,011 / 951 |
| ChatFeatureHost LOC / nb | 763 / 718 |
| InboxPage LOC / nb | 222 / 202 |
| admin-app chunk | ~73 kB |
| PropertiesPage chunk | ~48 kB |
| ChatFeatureHost chunk | ~22 kB |
| InboxPage chunk | ~7 kB |

## Ownership checkpoint

- Feature list APIs in App for properties/inbox/chat: **0**
- Selected Finding/Customer/Inbox/Chat in App: **0**
- Remaining App selection: `selectedPropertyForAI` + `aiPropertyOptions` (AI Content hub)
- Badge: `extraBadges.websiteChat/chatHistory` hardcoded **0** (dilution bug)
- Inbox badge: still `navigationCounts.pendingInbox` (OK)

## Batch 6 plan

1. Runtime smoke doc + browser if server available  
2. Extend `/api/navigation-counts` with lightweight `websiteChat` / `chatHistory` counts; wire sidebar  
3. Split PropertiesPage modal + ChatFeatureHost modes  
4. Architecture thresholds + report + PERFORMANCE resume gate only if COMPLETE

## After Batch 6 (recorded)

| Metric | Value |
|--------|------:|
| App LOC / nb | 1,623 / 1,496 |
| useState / useEffect / handlers | 26 / 9 / 9 |
| PropertiesPage | 553 |
| ChatFeatureHost | 335 |
| InboxPage | 225 |
| Badges (runtime) | inbox 4 · websiteChat 1 · chatHistory 2 |
| Verdict | FRONTEND ARCHITECTURE COMPLETE |
| Performance resume | YES |
