# AI Scanner 2.0 — Implementation Report

**Branch:** `feature/ai-scanner-2`  
**Date:** 2026-07-15  
**Mission orchestration:** deferred  

---

## 1. Current-state root cause

Scanner lưu ScannedContent trước, rồi filter ad-hoc (domain / hardcoded prefilter / supply dismiss). Không có SpamRule domain, không block phone admin, soft prefilter vẫn có thể chạy AI.

## 2. Spam domain

Pure types + evaluator:

- `SpamRule` / `SpamDecision` / `SpamMatch`
- `evaluateSpamPolicy` (no DB)
- `spamPolicyService` + TTL cache + invalidate on CRUD
- Rule types: phone, author, keyword/phrase, domain, source, hash, regex, classification, actor_role
- Actions: block | ignore | lower_score | allow

## 3. Phone blocking

`normalizeSpamPhoneInput` uses `normalizeVietnamPhone`:

- `0905 777 594` / `+84905777594` / `84 905 777 594` → `0905777594` + `+84905777594`
- Stored: `rawValue`, `normalizedValue`, `e164Value`
- Match → `spamDecision=block`, `primaryReason=blocked_phone`, hardGate

## 4. Rule priority

Per matched value: allow beats block. Across values: block > ignore > lower_score > allow-default. Expired/inactive skipped.

## 5. Pipeline position

In `processFindingForContent`:

1. Tier-1 **pre-AI** (phone, profile, source, hash, phrase…)
2. AI (skipped if hardGate)
3. Classification
4. Tier-2 **post-class** (classification / actor_role)
5. Score − lower_score penalty
6. Finding / Telegram only if not hardGate

## 6. ScannedContent behavior

| Decision | status | Finding | Telegram | AI |
|----------|--------|---------|----------|-----|
| block | `blocked` | no | no | skip (pre-AI) |
| ignore | `ignored` | no | no | skip |
| allow | continue | yes if pass | if eligible | yes if needed |

Metadata: `spamDecision`, `spamReason`, `matchedSpamRuleIds`, `blockedAt`, `blockedByRuleVersion` in metrics + rawData.

Filter UI: **Đã chặn**.

## 7. Settings UI

AI Agent → **Spam Control** (`/admin/agents/spam`):

Tabs phone / author / keyword / domain / source / whitelist / history + normalize preview + policy test.

## 8. Extraction v2

Deferred beyond existing extractors + phone re-use. Not a full V2 schema rewrite.

## 9. Classification v2

Incremental: antifalse for marketing “quý nhà đầu tư” / “vốn tự có từ” / “dòng tiền tốt” as investor demand.

## 10. Dedupe v2

Unchanged this milestone (existing hash/simhash).

## 11. Sync

Outbox `scanned_content_upsert` now includes `spamDecision`, `spamReason`, `matchedSpamRuleIds` (+ status/metrics). Local rule snapshot helper: `spamRuleSnapshot.ts` (VPS fetch + last-known fallback).

## 12. Backfill

- `npm run agent:backfill-spam-decisions` (dry-run default)
- `npm run agent:reanalyze-scanner-v2` (dry-run default)

Does not delete Lead/CRM/Finding.

## 13. Tests

- `npm run test:agent-spam-control` — 28 assertions (phone normalize, block, whitelist, scopes, phrase, expiry…)
- `npm run lint` — pass
- `npm run test:scanner-v2` — alias to spam-control for this milestone

## 14. Manual verification

Checklist in prompt Phase 23 — require running server + worker after restart (Prisma regenerate needed process restart).

## 15. Migration

`prisma/migrations/20260715090000_agent_spam_rules` → table `agent_spam_rules`.

## 16. Commits (planned)

See git log on branch; split docs / spam domain / UI / pipeline / sync.

## 17. Limitations

- Extraction V2 / dedupe V2 / person fingerprint graph incomplete
- Local worker does not auto-poll VPS rules yet (helper only)
- Quick actions on Finding drawer: API ready; UI buttons not fully wired every drawer
- Mission spam scope unused by design

## 18. Verdict

**AI SCANNER 2.0 PARTIAL**

Core spam control + phone block + pipeline hardGate + Settings CRUD + sync status/spam fields + tests: **shipped**.  
Extraction/classification/dedupe V2 depth and full end-to-end runtime smoke on live FB scan: **remaining**.
