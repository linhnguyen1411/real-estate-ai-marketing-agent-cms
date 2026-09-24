# AI Agent — Website Reader (Sprint 3.2)

> Adapter `website` / `forum` cho job `scan_source`.  
> Lưu `ScannedContent`, tạo `AgentFinding` theo keyword rules.

---

## Luồng xử lý

```
scan_source job
    → WebsiteAdapter
        → crawl (maxPages, sameDomainOnly)
        → extract title/body/links/canonical/publishedAt
        → contentNormalizer (hash, URL safety)
        → contentRepository (upsert ScannedContent)
        → findingRuleEngine (score → Finding + Notification)
    → AgentJob.result { pagesVisited, contentsSeen, ... }
```

---

## Module layout

```
server/agent-worker/
  adapters/
    sourceAdapter.ts      — registry abstraction
    websiteAdapter.ts     — BFS crawl website/forum
  services/
    contentNormalizer.ts  — URL safety, hash, HTML parse helpers
    contentRepository.ts  — upsert ScannedContent (dedupe by hash)
    findingRuleEngine.ts  — keyword scoring, Finding, Notification
  scanSourceHandler.ts    — load source/mission, dispatch adapter
  fixtures/
    sample-article.html   — offline test HTML
```

---

## Job type: `scan_source`

Payload:

```json
{
  "sourceId": "cuid...",
  "missionId": "optional",
  "triggeredBy": "user-id",
  "enqueuedAt": "ISO-8601"
}
```

**Result:**

```json
{
  "pagesVisited": 3,
  "contentsSeen": 3,
  "contentsInserted": 2,
  "findingsCreated": 1,
  "durationMs": 4200,
  "sourceId": "...",
  "sourceType": "website",
  "adapter": "website"
}
```

Job legacy `source_scan` vẫn được worker xử lý (alias).

---

## Source config (`AgentSource.config`)

| Key | Mặc định | Mô tả |
|-----|----------|--------|
| `maxPages` | 5 | Giới hạn trang crawl (1–25) |
| `sameDomainOnly` | true | Chỉ follow link cùng hostname |
| `pageTimeoutMs` | 30000 | Timeout `page.goto` |
| `maxContentChars` | 20000 | Cắt body text |
| `maxLinksPerPage` | 30 | Link enqueue mỗi trang |
| `positiveKeywords` | [] | Từ khóa cộng điểm |
| `negativeKeywords` | [] | Từ khóa trừ điểm |
| `minScore` | 50 | Ngưỡng tạo Finding |
| `notifyScore` | 75 | Ngưỡng tạo Notification |

Mission `rules` ghi đè/merge: `keywords` hoặc `positiveKeywords`, `negativeKeywords`, `minScore`, `notifyScore`.

---

## Chống trùng

- `contentHash = sha256(canonicalUrl + "\n" + normalizedBody)`
- Unique `(sourceId, contentHash)` → upsert `ScannedContent`
- Finding unique `(scannedContentId, type)`
- Notification unique `(companyId, eventKey)` với `eventKey = finding:{id}`

---

## An toàn crawl

- Chỉ `http`/`https`
- Chặn localhost, private IP
- Không follow binary (pdf, zip, media…)
- Abort Playwright resource `media`, `font`
- Không lưu cookie/header trong `rawData` — chỉ metadata (title, excerpt, linkCount…)

---

## API

`POST /api/agent/sources/:id/run` — enqueue một job `scan_source` (owner/company).

```json
{ "missionId": "optional-mission-id" }
```

Response:

```json
{ "sourceId": "...", "jobId": "..." }
```

CMS **Nguồn → Quét** gọi endpoint này trực tiếp.

---

## Test offline

```bash
npm run test:website-reader
```

- Parse fixture HTML (không network)
- Rule engine scoring
- Playwright `setContent` (không `goto` internet)

---

## Chạy end-to-end

1. Tạo nguồn `type: website` với URL công khai
2. Thêm `config.positiveKeywords` phù hợp
3. `POST /api/agent/sources/:id/run` hoặc CMS → Quét
4. `npm run agent:worker`
5. Kiểm tra **Jobs**, **Findings**, **Notifications**
