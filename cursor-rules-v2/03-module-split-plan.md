# Large File Split Plan — after App.tsx

Repo đã có sẵn 2 audit hữu ích, plan này build tiếp trên đó thay vì làm lại:
`docs/architecture/LARGE-FILE-INVENTORY.md`, `docs/architecture/FRONTEND-LARGE-FILE-DEBT.md`,
`docs/audit/TECHNICAL-DEBT.md`. Khác biệt: 2 audit cũ chỉ cover **frontend**; `server.ts` và các
route/service backend to hơn nhiều và chưa có plan cụ thể.

## Top offenders theo dòng code (không tính node_modules/dist)

| # | File | Dòng | Loại | Đã có plan cũ? |
|---|---|---:|---|---|
| 1 | `server.ts` | 3584 | Backend — Express app + **toàn bộ route thô** (auth, public, users, customers, properties, posts, inbox, chat, content...) khai trực tiếp trong file, không mount qua router riêng | Chưa — chỉ được nhắc "split routes/bootstrap post-v0.9" trong TECHNICAL-DEBT, chưa có plan |
| 2 | `server/agent/agentRoutes.ts` | 1783 | Backend — admin agent API surface | Chưa |
| 3 | `src/ListingsPage.tsx` | 1652 | Frontend — public listings page | Đã có (FRONTEND-LARGE-FILE-DEBT: P1, "dedicated refactor", chưa làm) |
| 4 | `server/agent-worker/services/findingRuleEngine.ts` | 1527 | Backend — lead-finding rule logic | Chưa |
| 5 | `src/App.tsx` | 1282 (đã giảm từ 5136 → 1282) | Frontend | **Đang làm dở** — còn Posts/SEO/AI Content blocks theo FRONTEND-LARGE-FILE-DEBT |
| 6 | `shared/agent-domain/resolveLeadIntelligence.ts` | 1198 | Domain logic dùng chung | Chưa |
| 7 | `server/modules/planning/campaignRuntime.ts` | 1166 | Backend | Chưa |
| 8 | `server/modules/control-plane/operationsService.ts` | 1096 | Backend | Chưa |
| 9 | `server/agentIngest/ingestService.ts` | 1044 | Backend | Chưa |
| 10 | `server/agent/agentDb.ts` | 1024 | Backend — DB access layer | Chưa |
| 11 | `src/features/agent/lead-intelligence/pages/LeadIntelligencePage.tsx` | 1015 | Frontend | Đã có (P2, "agent UX decomposition") |
| 12 | `server/modules/executive-dashboard/executiveService.ts` | 977 | Backend | Chưa |

**Nhận xét:** backend nặng hơn frontend nhiều (server.ts một mình đã to hơn App.tsx gốc lúc chưa
refactor gần 5000 dòng nếu tính cả các block cũ). Nếu mục tiêu là giảm token khi Cursor/Claude Code
làm việc, **ưu tiên tách `server.ts` trước** — đây là file mọi request API chạm vào cũng phải mở, và
nó không tách theo module như `agentRoutes.ts` đã làm (agentRoutes tách riêng khỏi server.ts, nhưng
tự nó lại phình to 1783 dòng — cần tách tiếp bên trong).

## Nguyên tắc tách (tái dùng đúng pattern đã áp dụng cho App.tsx)

- File `< 200 dòng` mỗi feature module (đã áp dụng cho frontend, áp dụng luôn cho backend)
- Không prop-drilling / không truyền context quá 2 lớp
- Zustand cho state dùng chung (frontend) — tương đương: 1 service singleton/factory cho backend
  thay vì import chéo trực tiếp giữa route handlers
- `React.lazy` cho code-splitting (frontend) — tương đương backend: mount router theo domain, không
  khai route thô trong `server.ts`

## Phase 1 — `server.ts` (ưu tiên cao nhất, ảnh hưởng mọi request)

Tách theo domain, mount như đã làm với `agentRoutes` và `social-publishing`:

```
server/
  bootstrap/
    createApp.ts          # express(), middlewares (compression, cache-control, json, static)
    errorHandler.ts
  modules/
    auth/authRoutes.ts           # /api/auth/*
    public-site/publicRoutes.ts  # /api/public/* (properties, homepage, seo, agents, chat guest)
    users/usersRoutes.ts         # /api/users*, /api/member-permissions*
    customers/customersRoutes.ts # /api/customers*
    properties/propertiesRoutes.ts
    posts/postsRoutes.ts
    inbox/inboxRoutes.ts
    chat/chatRoutes.ts            # /api/chat/*, /api/ai/chat
    content/contentRoutes.ts      # /api/content/generated*
  server.ts   <- còn lại: bootstrap + mount tất cả router trên, target < 200 dòng
```

Cách làm an toàn (đúng tinh thần Architecture Gate mới):
1. Impact Analysis trước: liệt kê route nào gọi service/db nào, route nào share state (vd.
   `req.app.locals`) — ghi rõ "Not Affected" để tránh động tới Runtime/Fleet/Browser (Protected).
2. Tách từng domain **một router một PR nhỏ**, giữ nguyên path/behavior, chạy `npm run lint` +
   smoke test tương ứng sau mỗi domain (vd. tách xong `customersRoutes` → chạy lại flow CRM thủ
   công hoặc script liên quan nếu còn).
3. Xoá route thô khỏi `server.ts` chỉ sau khi router mới đã mount và test pass — không xoá trước.

## Phase 2 — Backend services còn lại (1000+ dòng)

Cùng nguyên tắc, ưu tiên theo mức độ "mọi request đều chạm":
1. `agentRoutes.ts` (1783) → tách theo sub-resource (findings, sources, jobs, config) giống cách
   `server.ts` sẽ được tách ở Phase 1.
2. `agentDb.ts` (1024) → tách theo bảng/domain (findings, jobs, sources) thay vì 1 file DB access
   layer chung — giảm rủi ro khi sửa 1 domain phải load cả file.
3. `findingRuleEngine.ts`, `resolveLeadIntelligence.ts`, `campaignRuntime.ts`, `operationsService.ts`,
   `ingestService.ts`, `executiveService.ts` — mỗi file tách theo input/output rõ ràng (rule
   evaluation vs scoring vs formatting), review riêng từng file khi có time, không cần làm cùng lúc.

## Phase 3 — Frontend còn lại (theo đúng audit cũ, chưa cần làm lại)

Giữ nguyên plan đã có trong `FRONTEND-LARGE-FILE-DEBT.md`:
- `ListingsPage.tsx` (P1) — refactor riêng, ngoài phạm vi admin shell
- `LeadIntelligencePage.tsx`, `UsersPage.tsx` (P2)
- Nốt phần Posts/SEO/AI Content còn lại trong `App.tsx` (P2) — hoàn tất nốt việc đang làm dở

## Ước tính lợi ích token

Mỗi lần Cursor/Claude Code mở `server.ts` hiện tại để sửa 1 route nhỏ, nó nạp nguyên 3584 dòng.
Sau Phase 1, sửa 1 route customers chỉ cần mở `customersRoutes.ts` (~150-200 dòng ước tính) — giảm
~90% token cho loại task phổ biến nhất (sửa 1 API endpoint).
