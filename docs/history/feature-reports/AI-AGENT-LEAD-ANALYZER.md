# AI Agent — Lead Analyzer (Sprint 4.1)

> Tái sử dụng `generateText` từ `server/aiService.ts` (Ollama / OpenAI / Gemini).  
> Prefilter deterministic trước khi gọi AI — phù hợp pipeline hàng nghìn bài.

---

## Luồng

```
ScannedContent + keyword finding
    → leadPrefilter (keywords, length, spam)
    → [pass | deepAnalyze] ?
        → leadAnalyzer (AI JSON)
        → validate + sanitize
        → fallback deterministic nếu JSON/AI lỗi
    → AgentFinding.extractedData.leadAnalysis
    → AgentFinding.reasons (keyword + AI/prefilter)
```

---

## Module

| File | Vai trò |
|------|---------|
| `server/agent/leadAnalysisSchema.ts` | Types, validate, parse JSON |
| `server/agent/leadPrefilter.ts` | Prefilter deterministic |
| `server/agent/prompts/leadAnalyzerPrompt.ts` | System/user prompt |
| `server/agent/leadAnalyzer.ts` | Orchestration + fallback + cost guard |

---

## Output schema

```json
{
  "classification": "buyer|renter|seller|broker|spam|unknown",
  "intent": "buy|rent|sell|service|unknown",
  "confidence": 0.82,
  "score": 76,
  "region": "Đà Nẵng",
  "budgetMin": null,
  "budgetMax": null,
  "areaMin": 75,
  "areaMax": null,
  "propertyTypes": ["căn hộ"],
  "urgency": "medium",
  "contact": { "phone": "0905..." },
  "summary": "...",
  "reasons": ["..."],
  "analysisMeta": {
    "source": "ai|fallback",
    "prefilterScore": 40,
    "analyzedAt": "ISO-8601"
  }
}
```

Lưu trong `AgentFinding.extractedData.leadAnalysis` (kèm `keywordMatch`, `canonicalUrl`).

---

## Prefilter

Chạy **trước** AI:

- Độ dài tối thiểu body (mặc định 80 ký tự)
- Positive keywords (+8 body / +12 title)
- Negative keywords (-15 mỗi hit; ≥2 hit → hard spam)
- Lặp từ/ký tự spam
- Pattern broker spam (zalo + inbox + cam kết…)

AI chỉ chạy khi:

- `prefilter.score >= prefilterMinScore` (mặc định 20), **hoặc**
- `mission.rules.deepAnalyze === true` / `source.config.deepAnalyze === true`

Hard spam **không** gọi AI kể cả `deepAnalyze`.

---

## Cost guard

| Env | Mặc định | Mô tả |
|-----|----------|--------|
| `AGENT_LEAD_ANALYSIS_MAX_CHARS` | 4000 | Cắt body đưa vào prompt |
| `AGENT_LEAD_ANALYSIS_MAX_PER_JOB` | 10 | Số lần phân tích AI/fallback mỗi job `scan_source` |
| `AGENT_LEAD_ANALYSIS_TIMEOUT_MS` | 45000 | Timeout `generateText` |
| `AGENT_LEAD_ANALYSIS_SKIP_AI` | — | `1` = chỉ fallback (test/dev) |

Model/provider lấy từ CMS Settings + `aiService` (không tạo provider mới).

---

## Prompt rules

- Chỉ gửi: title, body (đã cắt), URL, loại nguồn, vài keyword tham khảo
- **Không** đưa lịch sử CMS / toàn bộ DB vào prompt
- Yêu cầu JSON thuần, không markdown
- Không bịa SĐT/email/region nếu bài không có → `sanitizeAnalysisAgainstSource` strip field không khớp text

---

## Retry & fallback

1. Gọi AI một lần
2. Parse JSON (`extractJsonPayload` + validate)
3. Retry parse một lần (sửa trailing comma / quote)
4. Nếu vẫn lỗi → `buildDeterministicFallback` (keyword heuristics)

---

## Tích hợp worker

`findingRuleEngine.processFindingForContent` gọi `analyzeLeadContent` sau khi tạo finding keyword.

`websiteAdapter` truyền `analysisBudget` theo job để giới hạn số lần phân tích.

---

## Test

```bash
npm run test:lead-analyzer   # schema, prefilter, parser, fallback — không network
npm run lint
npm run build
```

---

## Mission / source config

```json
{
  "deepAnalyze": false,
  "prefilterMinScore": 30,
  "positiveKeywords": ["cho thuê", "cần mua"],
  "negativeKeywords": ["bán gấp"]
}
```

`keywords` trên mission vẫn được merge như positive keywords (Sprint 3.2).
