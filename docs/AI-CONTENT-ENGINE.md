# AI Content Engine — PHASE 25

Refactor Prompt Framework cho sinh nội dung SEO/blog Estoria (`bdsdanang.site`).

**Phạm vi:** Chỉ Prompt Engine — không đổi API route, model AI, database, CMS UI.

---

## Kiến trúc Prompt (Layered)

```
System Prompt   → persona chuyên gia BĐS Nam Đà Nẵng
       ↓
Style Prompt    → giọng văn, cấm sales/AI
       ↓
Brand Prompt    → Sun Group, Mai Đăng Chơn, FPT contextual
       ↓
SEO Prompt      → structure, insight, ending rules
       ↓
User Prompt     → keyword, article type, section plan, CTA
       ↓
Validator       → boilerplate scan + AI rewrite (nếu FAIL)
```

### File map

| File | Vai trò |
|------|---------|
| `server/ai/prompts/systemPrompt.ts` | Persona — không sales, không AI |
| `server/ai/prompts/stylePrompt.ts` | Giọng phân tích, cấm cảm thán |
| `server/ai/prompts/brandPrompt.ts` | Inventory Sun Group, FPT secondary |
| `server/ai/prompts/seoPrompt.ts` | SEO tự nhiên, FAQ, meta, ending |
| `server/ai/prompts/contentRules.ts` | Cụm cấm, heading cấm, địa danh |
| `server/ai/prompts/sectionTypes.ts` | Section generator — mỗi H2 một loại |
| `server/ai/prompts/validatorPrompt.ts` | Prompt rewrite sau audit |
| `server/ai/prompts/assemblePrompt.ts` | Ghép layer → system/user |
| `server/ai/prompts/boilerplateDetector.ts` | Scan similarity & banned phrases |
| `server/ai/prompts/contentValidator.ts` | Orchestrate validate + rewrite |
| `server/ai/prompts/index.ts` | Barrel export |

### Integration

| Consumer | Dùng gì |
|----------|---------|
| `server/blog/aiDraftService.ts` | `assembleBlog*` + `validateAndPolishContent` |
| `server/blog/aiAssistService.ts` | `assembleAssistSystemPrompt` + `promptContext: editorial` |
| `src/.../seoPromptBuilder.ts` | `assembleSeoClipboardPrompt` (đồng bộ server) |
| `server/aiService.ts` | `promptContext: 'editorial'` — bỏ wrapper CRM cho blog |

---

## Validation Rules

### 1. Banned phrases (>2 lần = FAIL)

Ví dụ: `cần kiểm chứng thực tế`, `nhà đầu tư nên`, `trong bối cảnh`, `động lực tăng trưởng`, `hệ sinh thái`, `bức tranh`, ...

Danh sách đầy đủ: `contentRules.ts` → `BANNED_PHRASES`.

### 2. Banned headings

`Bối cảnh thị trường`, `Động lực tăng trưởng`, `Khả năng khai thác dòng tiền`, ...

### 3. Boilerplate detector

| Check | Ngưỡng |
|-------|--------|
| Paragraph similarity | Jaccard ≥ 25% giữa 2 đoạn |
| Heading similarity | Jaccard ≥ 55% hoặc cùng prefix 2 từ |
| Duplicate sentence | Cùng câu > 2 lần |
| Banned ending | Regex trên 600 ký tự cuối |
| FPT dominance | Bài Sun: FPT ≥ 3 và ≥ Sun mentions |

### 4. Content validator flow

1. Generate draft (`generateAiDraftMarkdown`)
2. Retry nếu banned heading (1 lần)
3. `validateAndPolishContent` — tối đa 2 pass rewrite
4. Retry full generation nếu vẫn FAIL (1 lần, kèm `validationViolations`)

---

## Anti-Boilerplate Rules

- Không outline cố định cho mọi bài — dùng **section types** (`sectionTypes.ts`)
- Mỗi H2 = 1 loại: vị trí / so sánh / khai thác / thanh khoản / nhóm KH / quan sát...
- Ít nhất 3 insight, 2 so sánh, 1 phản biện (trong SEO layer)
- Kết bài bằng insight cụ thể — không disclaimer

---

## Brand Rules

**Ưu tiên:** Sun Symphony, S Light, Cora, FourS → Mai Đăng Chơn → đất/nhà phố Nam Đà Nẵng

**FPT City:** Chỉ bối cảnh dòng người — không làm trung tâm bài Sun Group.

---

## SEO Rules

- Keyword tự nhiên, không nhồi
- H2 đa dạng cấu trúc
- YAML frontmatter + FAQ + CTA
- Meta title 50–60, description 140–160 ký tự

---

## Rewrite Rules

Khi FAIL validation:

1. `buildValidatorRewritePrompt` — liệt kê vi phạm + bài gốc
2. `generateText` với `promptContext: 'editorial'`
3. Re-scan cho đến khi pass hoặc hết retry budget

---

## Clipboard workflow (Admin SEO)

`buildSeoContentPrompt()` trong CMS copy prompt dùng **cùng layer** với server draft — không còn prompt riêng lệch chuẩn.

---

## Mở rộng sau PHASE 25

- Tách chat prompts (`server.ts` Lily) vào `server/ai/prompts/chat/`
- Marketing property prompts từ `aiService.ts` → `prompts/marketing/`
- Unit tests cho `boilerplateDetector` với bài mẫu FAIL/PASS
