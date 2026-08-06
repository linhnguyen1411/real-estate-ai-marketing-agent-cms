# Scanner Current-State Audit — AI Scanner 2.0

**Branch:** `feature/ai-scanner-2`  
**Base:** post frontend architecture (`feature/performance-cms-loading` merged)  
**Date:** 2026-07-15  
**Mission orchestration:** deferred (out of scope)

---

## 1. Pipeline hiện tại (thứ tự thực tế)

| # | Bước | File / hàm chính |
|---|------|------------------|
| 1 | Worker claim job `scan_source` | `server/agent-worker/workerLoop.ts` → `runScanSourceJob` |
| 2 | Adapter Facebook / Website | `facebookGroupAdapter.scan` / `websiteAdapter.scan` |
| 3 | Parse / classify article kind (FB: post vs comment) | `facebookArticleClassifier`, GraphQL/DOM parsers |
| 4 | Content identity skip (session / existing) | `facebookIncrementalScan`, `findExistingScannedContentDuplicate` |
| 5 | **Persist ScannedContent trước** (`status: collected`) + raw extractors vào `rawData.extracted` | `contentRepository.saveFacebookScannedPost` / `saveScannedContent` |
| 6 | Finding pipeline | `findingRuleEngine.processFindingForContent` |
| 7 | Keyword score + `extractLeadData` | `scoreContent`, `server/agent/extractors/*` |
| 8 | Domain gate | `domainClassification.evaluateRealEstateRelevance` |
| 9 | Soft/hard prefilter | `leadPrefilter.runLeadPrefilter` |
| 10 | Pre-AI stop (too_short / hard_spam / keyword_gate / out_of_domain) | `findingRuleEngine` |
| 11 | AI enrichment (nếu không stop) | `leadAnalyzer.analyzeLeadContent` |
| 12 | Classification merge | `subjectDirection.detectSubjectDirection` **wins** when ≠ `unknown` |
| 13 | Post-class gates (clear supply → out_of_scope, score gate) | `findingRuleEngine` |
| 14 | Finding dedupe | `decideFindingDedupe` |
| 15 | Create/update Finding + Telegram + sync | notifications + `agentSync/enqueue` |

**Điểm quan trọng:** ScannedContent được lưu **trước** AI/spam-like filters. Filter chỉ đổi `status` / `metrics.leadAnalysis`, không xóa row.

---

## 2. Extract phone / name / money / location / property

Qua `extractLeadData` (`server/agent/extractors/index.ts`):

| Loại | Module | Hàm |
|------|--------|-----|
| Phone | `phoneExtractor.ts` | `normalizeVietnamPhone`, `extractPhones`, `extractPhoneData` |
| Contact/name | `contactExtractor.ts` | `extractContactData` |
| Money | `moneyExtractor.ts` | `extractMoneyData` |
| Location | `locationExtractor.ts` | `extractLocation` |
| Property / demand cues | `propertyExtractor.ts` | `extractPropertyData`, `extractDemand` |

AI có thể bổ sung cùng slot; read path: `shared/agent-domain/resolveLeadIntelligence.ts`.

Phone đã có:
- `normalized` dạng quốc gia `0xxxxxxxxx`
- `e164` dạng `+84…`
- **Thiếu:** model/rule blocklist admin; không có e164-first store cho spam policy.

---

## 3. Classification

| Concern | Nơi xử lý |
|---------|-----------|
| Domain RE vs ngoài ngành | `domainClassification.ts` |
| Demand vs supply / broker | `subjectDirection.detectSubjectDirection` |
| AI class | `leadAnalyzer` + prompt |
| Deterministic property class | `propertyExtractor` |
| Merge | subjectDirection override AI khi chắc |

Classes: `buyer|renter|investor|seller|landlord|broker|service|discussion|spam|unknown`.

Target Finding mặc định: demand-side. Clear supply/spam hay bị dismiss / `out_of_scope`.

---

## 4. Dedupe

| Lớp | Cơ chế | Nơi |
|-----|--------|-----|
| Content identity | externalId → canonicalUrl → normalizedHash → contentHash | `findingDedupService` / content repo |
| Fingerprints | SHA normalized + simhash 64-bit | `contentFingerprint`, `contentNormalizer` |
| Finding near-dup | same norm hash; simhash ≥0.9 + same author → duplicate; ≥0.82 → possible | `decideFindingDedupe` |
| Phone cross-content | **Không có** (chỉ dedupe list phone trong 1 bài) | — |

---

## 5. Block / ignore hiện tại

- FB: comment/unknown **không insert**
- Domain reject / hard_spam / soft supply → ScannedContent `ignored` (+ filterStage)
- UI manual ignore/archive trên Scanned Content
- Finding `dismissed` → re-scan `ignored_by_rule`
- **Không có** bảng AgentSpamRule / admin phone blocklist

---

## 6. Spam rules hiện có?

Có nhưng **hardcoded / mission keywords**, không phải Spam Control domain:

- `leadPrefilter`: repetition, ≥2 negative keywords, broker-spam soft patterns
- `defaultKeywordSets.exclusionSignals` (tuyển dụng, rao dịch vụ, bán data…)
- Mission UI: positive/negative keywords + minScore
- **Không** support admin phone/profile/domain block CRUD

---

## 7. Block trước hay sau AI?

| Trước AI | Sau AI / class |
|----------|----------------|
| domain reject/needs_review | clear supply / out_of_scope |
| hard_spam, too_short | low_final_score |
| keyword_only ∧ low keyword score | finding dedupe |

Soft prefilter **fail vẫn có thể gọi AI** (`decideShouldRunAi` ít tôn trọng soft fail).

---

## 8. Bài ignored có lưu ScannedContent?

**Có.** Insert `collected` trước → filter → `ignored` / `needs_review` / `analyzed`. Row giữ để audit. Sync ignored khi local sync bật (payload mang `status` + `metrics`). Manual ignore UI có thể **không** enqueue sync (gap).

---

## 9. Trường thiếu nhiều nhất

Từ scoring / UI “Chưa xác định”:

1. `personName` / contact name  
2. `primaryPhone`  
3. budget / asking price  
4. primary location  
5. propertyType  
6. classification `unknown`

---

## 10. Pattern phân loại sai phổ biến

- Listing cashflow / “dòng tiền sẵn” → investor (đã có counter trong subjectDirection + fixtures)
- Broker supply vs “khách cần” (represented demand)
- Comment FB bị lấy như post (có cleanup script)
- Generic “cần mua” không kèm object BĐS → domain reject

---

## 11. UI Settings phù hợp cho Spam Control

| Surface | Fit |
|---------|-----|
| **System Settings / AI Agent section** | Company-wide block/allow lists (đúng yêu cầu Scanner 2.0) |
| Missions keywords | Soft relevance, **không** thay spam policy |
| Scanned Content / Lead Intelligence | Quick actions “Chặn số / người đăng” |
| Sources UI | Hiện chưa edit keyword; có thể gắn rule theo `sourceId` |

→ Thêm tab **Spam & Block Rules** dưới AI Agent / System Settings.

---

## 12. Sync local → VPS

Payload `scanned_content_upsert` / `finding_upsert` mang:

- `status`, `metrics` (filterStage trong leadAnalysis), hashes, author, extraction fields trên Finding

**Thiếu contract:**

- `spamDecision` / `spamReason` / matched rule IDs  
- rule snapshots  
- blocked-as-first-class field  

Manual ignore có thể không sync.

---

## Root cause cho Scanner 2.0

1. Không có spam policy domain + persistence.  
2. Phone normalize đã có nhưng không gắn block gate admin.  
3. Soft spam vẫn tốn AI budget.  
4. Không có filter UI “Đã chặn”.  
5. Sync chưa mang blocked decision.  
6. Extraction/classification/dedupe đã khá mạnh deterministic — cần mở rộng, không rebuild từ đầu.

---

## Insertion points (đã chốt cho implement)

**Tầng 1 — trước AI** (trong `processFindingForContent`, sau domain / cạnh prefilter):

- phone / profile / source / URL / content hash / phrase mạnh → `block|ignore` → skip AI, persist `blocked`/`ignored`, no Finding, no Telegram.

**Tầng 2 — sau classification:**

- classification spam / recruitment / out-of-scope policies có thể cấu hình.

**ScannedContent status mới cần chuẩn hóa thêm:** `blocked` (cạnh `ignored`), metadata spamDecision.

---

## Out of scope (milestone này)

- Mission orchestration  
- CRM / Inventory lifecycle changes  
- Hard-delete blocked posts  
- Facebook selector churn (trừ bug cụ thể)

---

## Next implementation

1. Spam domain + phone normalize/block (reuse `normalizeVietnamPhone`)  
2. Schema `AgentSpamRule` + API + Settings UI  
3. Pipeline gate before AI  
4. Extraction/classification/dedupe v2 + sync + backfill + tests  
