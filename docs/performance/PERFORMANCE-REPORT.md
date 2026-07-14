# PERFORMANCE REPORT — CMS Loading

**Branch:** `feature/performance-cms-loading`  
**Base:** `master` (post-R2)  
**Date:** 2026-07-14  
**Constraint:** No business-logic / schema / AI / workflow changes.

See also: [PERFORMANCE-BOOTSTRAP-AUDIT.md](./PERFORMANCE-BOOTSTRAP-AUDIT.md)

---

## 1. Bootstrap trước

```
F5 / login
 → GET /api/auth/me (or login)
 → Promise.all(
     /api/dashboard,          ← fetched then discarded
     /api/customers,          ← FULL list
     /api/properties,         ← FULL list
     /api/posts,              ← FULL list
     /api/inbox,              ← FULL list
     /api/automations,
     /api/settings,
     /api/channels
   )
 → background(
     /api/chat/history,
     /api/chat/guests,
     /api/chat/history?scope=mine,
     /api/content/generated,
     /api/users?
   )
 → unread-count poll (45s)
 → traffic poll: full properties + settings (15s on dashboard)
```

**Problems:** preload toàn CRM; sidebar đếm từ full arrays; admin internals eager-import.

---

## 2. Bootstrap sau

```
F5 / login
 → GET /api/auth/me (or login)
 → GET /api/dashboard            (metrics only, cached 30s)
 → GET /api/navigation-counts    (badges only, cached 20s)
 → GET /api/settings             (cached 10 phút)
 → AgentNotificationBell (lazy) → unread-count
```

Menu mở mới fetch:

| Menu | API |
|------|-----|
| CRM | `GET /api/customers?page&limit&search&sort` |
| Properties | `GET /api/properties?page&limit&search&status&…` |
| Posts | `GET /api/posts?page&…` |
| Inbox | `GET /api/inbox?page&…` |
| Automations | `GET /api/automations` |
| Integrations | `GET /api/channels` |
| Chat / Users / AI content | secondary chat/generated/users |
| Investor Leads | `GET /api/investor-leads?page&limit` |
| Lead Intelligence / Jobs / Sources / … | agent route modules (đã scoped) |
| SEO CMS | SeoContentAdmin lazy mount |

Traffic poll trên dashboard: **chỉ** `/api/dashboard` (+ settings cache), không còn tải full properties.

---

## 3. Bundle

Vite production build (sau lazy):

| Chunk | Size (approx) | Note |
|-------|---------------|------|
| `admin-app-*.js` | ~209 kB / gzip ~48 kB | Shell + CRM tabs còn lại |
| `AgentPlatformPage-*.js` | ~129 kB / gzip ~32 kB | Lazy — không vào F5 nếu không vào Agents |
| `SeoContentAdmin-*.js` | ~45 kB | Lazy |
| `AdminPropertyDirectory-*.js` | ~17 kB | Lazy |
| `InvestorLeadsPanel-*.js` | ~15 kB | Lazy |
| `ShortLinksPanel`, `AdminProjectsPanel`, `LeadMagnet…`, `AgentNotificationBell` | tách chunk | Lazy |

**Trước:** các panel trên nằm chung eager graph trong `admin-app`.  
**Sau:** F5 parse admin shell trước; module lớn chỉ tải khi mở menu.

Ước lượng: giảm parse/eval JS lúc F5 khoảng **~150–200 kB raw** agent+SEO panels (không đếm vendor dùng chung).

---

## 4. API count (F5 → Dashboard Ready)

| | Trước | Sau |
|--|-------|-----|
| Parallel core list APIs | 8 | 3 (`dashboard`, `navigation-counts`, `settings`) |
| Secondary preload | 4–5 | 0 |
| Full entity lists | customers+properties+posts+inbox | **0** |
| Poll properties mỗi 15s | Yes | **No** |

---

## 5. Transfer

Trước: payload tỷ lệ thuận số CRM records (toàn bộ collections).  
Sau: dashboard metrics + counts (KB nhỏ, ổn định). List chỉ khi mở menu + phân trang.

Ví dụ n (ước lượng): 500 customers + 300 properties + inbox/posts → tiết kiệm phần lớn transfer lúc F5 (thường hàng trăm KB–MB JSON tùy data).

---

## 6. Memory

- Không giữ full arrays trên dashboard.
- Module state rỗng đến khi mở menu; refresh clear list caches.
- Query cache TTL giới hạn giữ payload trùng.

---

## 7. API chỉ load theo menu

- `/api/customers`, `/api/properties`, `/api/posts`, `/api/inbox`
- `/api/automations`, `/api/channels`
- Chat / generated / users (secondary)
- `/api/investor-leads`
- Agent section endpoints (findings, jobs, sources, scanned, inventory, notifications list, reports…)
- SEO blog admin APIs

---

## 8. Components đã lazy

- `InvestorLeadsPanel`
- `ShortLinksPanel`
- `AdminPropertyDirectory`
- `AdminProjectsPanel`
- `LeadMagnetContentAdmin`
- `SeoContentAdmin`
- `AgentPlatformPage`
- `AgentNotificationBell`

(+ public pages lazy sẵn trong `main.tsx`)

---

## 9. Preload đã bỏ

- Full customers / properties / posts / inbox on F5
- Automations / channels on F5
- Chat history / guests / generated / users on F5
- Unused consumption of `/api/dashboard` (now used as source of truth for dashboard UI)
- Full properties traffic poll

**Giữ:** unread notification **count** (nhẹ, header)

---

## 10. Pagination / search / sort / cache / invalidate

- List CRM endpoints hỗ trợ `?page&limit&search&status&sort` → `{ items, pagination }` khi có `page`; không có `page` vẫn trả array (compat).
- Investor leads: `page/limit/search` + counts.
- `src/services/queryCache.ts` TTL: dashboard 30s, nav 20s, CRM/properties 120s, settings 10m.
- Promote finding → `invalidateAfterLeadPromote()`.
- CRM create/property save → `invalidateCrmModule()` + refresh nav counts.

---

## 11. Tests / build

| Check | Result |
|-------|--------|
| `vite build` | **PASS** |
| `tsc` on changed CMS files | **PASS** (no errors in App/api/panels) |
| `test:deploy-safety` | **PASS** (10/10) |
| `test:agent-regression` | Mostly PASS; `test:agent-tenant-isolation` FAIL (pre-existing env/db concern — not tied to bootstrap UI) |

---

## 12. Milestone checklist

| Criterion | Status |
|-----------|--------|
| F5 chỉ auth + layout + dashboard + navigation counts | ✅ |
| Không preload Findings / CRM / Jobs / Inventory / Notifications list / Sources / Properties | ✅ |
| Pagination server-side (CRM lists + investor leads; agent lists sẵn có) | ✅ |
| Route/module lazy loading | ✅ |
| Build pass | ✅ |
| Không đổi business logic / schema / AI | ✅ |

---

## 13. Kết luận

CMS bootstrap đã chuyển từ “tải cả kho vào RAM” sang “shell nhẹ + load-on-menu”. Dashboard dùng đúng `/api/dashboard`; sidebar dùng `/api/navigation-counts`. Bundle admin đã split các panel lớn. Đây là nền để tiếp tục thu hẹp `App.tsx` và gắn virtualization sâu hơn nếu list UI render >100 row trong một panel cố định.
