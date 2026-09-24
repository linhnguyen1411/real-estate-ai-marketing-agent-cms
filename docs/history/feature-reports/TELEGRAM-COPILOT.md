# Telegram Copilot

**Status:** TELEGRAM COPILOT COMPLETE  
**Phase:** T4  
**Commit:** `feat(copilot): introduce telegram copilot`

---

## Goal

Telegram is no longer slash-only Operations Center — it becomes an **AI Copilot** that speaks natural language, keeps chat context, proposes approvals, and pushes periodic summaries / incident actions.

---

## Architecture

```
Telegram (adapter)
        ↓
Copilot Layer (channel-agnostic)
        ↓
Command Registry / Intent Strategies
        ↓
Control Plane (operationsService / reportEngine)
        ↓
Mission / Runtime
        ↓
Execution Agent
```

Telegram **never** bypasses Control Plane.  
Copilot Engine is reusable by Discord / Slack / Zalo / Web Chat / Voice later.

See [COPILOT-ENGINE.md](../architecture/COPILOT-ENGINE.md).

---

## Natural language examples

| User | Intent |
|------|--------|
| Có gì mới? | `whats_new` |
| Hôm nay có bao nhiêu lead? | `lead_count` |
| Có agent nào offline? | `agents_offline` |
| Retry tất cả publish lỗi. | `retry_failed_publish` |
| Dừng scanner buyer. | `pause_scanner` |
| Khởi động lại publish. | `resume_publish` |
| Tìm lead Hòa Xuân hôm nay. | `search_leads` |

Slash commands still work (`/dashboard`, `/jobs`, …).  
`/ask <text>` forces NL path.

---

## Context

After `/jobs`, saying `retry job 2` resolves the 2nd id from the last list (session memory per chat).

---

## Approval & Incident

**Approval keyboard:** Approve · Reject · Edit · Create Mission → `/approval …`  
**Incident keyboard:** Acknowledge · Retry · Mute · Escalate → `/incident …`

Agent Offline / Browser Crash / Queue Blocked alerts attach incident buttons.

---

## Summary schedule

Asia/Ho_Chi_Minh wall clock:

- **08:00** morning
- **12:00** noon
- **18:00** evening

Payload: Lead · Mission · Publish · Campaign metrics · Health · Insight lines.

Env:

- `TELEGRAM_SUMMARY_TICK_MS` (default 60000)
- `TELEGRAM_COPILOT_LLM=1` optional LLM classify / insight enrich

---

## Tests

```bash
npm run test:telegram-copilot
npx tsc --noEmit
```
