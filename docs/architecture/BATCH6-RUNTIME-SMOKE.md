# BATCH 6 — Runtime Smoke

**Date:** 2026-07-14  
**Environment:** local `npm run dev` on `:3000` with PostgreSQL (DATABASE_URL from `.env.example` template).  
**Auth:** owner role (local seed).  
**Method:** Cursor browser automation + `fetch` instrumentation.

## Summary

| Area | Result |
|------|--------|
| App shell | PASS |
| Properties | PASS (list + route mount) |
| Inbox | PASS |
| Chat modes + poll cleanup | PASS |
| Badges | PASS (non-zero) |
| CRM / Investor / Agent LI | PASS |
| Settings | BLOCKED (tool handoff mid-session after LI; page remains lazy-mounted in App) |
| Mark-read / send mutations | SKIPPED (safe — no production sends) |

## Cases

### App shell
| Case | Status | Evidence |
|------|--------|----------|
| Login | PASS | `/admin/login` → dashboard as System Owner |
| Dashboard | PASS | KPI cards + sidebar visible |
| Sidebar | PASS | Primary nav items render |
| Direct route refresh | PASS | Navigate `/admin/dashboard` restores shell |
| Agent permission route | PASS | `/admin/agents/findings` loads |
| Mobile sidebar toggle | BLOCKED | Not exercised in this pass |

### Badges
| Case | Status | Evidence |
|------|--------|----------|
| Website chat badge ≠ 0 | PASS | Sidebar `Chat khách website **1**` |
| Chat history badge ≠ 0 | PASS | Sidebar `Lịch sử chat **2**` |
| Inbox pending | PASS | Sidebar inbox **4** |
| Not hardcoded zero | PASS | Counts from `/api/navigation-counts` (`websiteChat`, `chatHistory`) |

### Properties
| Case | Status | Evidence |
|------|--------|----------|
| Route open | PASS | Sidebar → “Đang tải BĐS…” then list |
| List load | PASS | Large directory snapshot (~357 refs) |
| Create modal | SKIPPED | Form extracted; open not click-tested this pass |
| Duplicate API | PASS | After open: single `/api/properties` (plus `/api/users` for creator labels) |

### Inbox
| Case | Status | Evidence |
|------|--------|----------|
| Route open | PASS | “Hòm thư” / Social Media Inbox text present |
| List load | PASS | `/api/inbox` once on mount |

### Chat
| Case | Status | Evidence |
|------|--------|----------|
| Assistant mode | PASS | Heading “Trợ lý AI nội bộ” |
| Website mode | PASS | Heading “Chat khách website” |
| Poll start | PASS | Repeated `/api/chat/guests` + `/api/chat/history` while mode active |
| Poll stop on leave | PASS | After Dashboard: 5s window → **0** chat APIs; only `/api/dashboard` |
| Remount second poller | PASS | No chat traffic after leave (cleanup via `useChatPolling` `clearInterval`) |
| Send real message | SKIPPED | Intentionally not sent |

### Agent / CRM regression UI
| Case | Status | Evidence |
|------|--------|----------|
| Lead Intelligence | PASS | Nav + `/admin/agents/findings` |
| Investor Leads | PASS | “Leads đầu tư (Investor Funnel)” |
| CRM | PASS | CRM content after sidebar open |
| Settings | BLOCKED | Click interrupted by MCP handoff |

## Console / network notes
- No fatal console errors observed during shell + Properties/Inbox/Chat navigation.
- Chatbot mount may double-fetch history/guests under React StrictMode (dev only); not a leftover interval after leave.
- Bootstrap does not preload properties/inbox/chat lists until their menus open.

## Smoke verdict
**Core Properties / Inbox / Chat + badge smoke: PASS**
