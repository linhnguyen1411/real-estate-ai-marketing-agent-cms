# BATCH 5 — Inbox audit

## What Inbox is

CMS **multi-channel social inbox** UI in admin (`activeTab === 'inbox'`).

Copy in UI: Messenger, Zalo, TikTok comments, Website Livechat. Data via `listInbox` / `generateInboxReply` / `sendInboxReply` — **not** Gmail and not Graph webhook worker ownership in this frontend batch.

## Former App ownership (pre-extract)

| Item | Notes |
|------|-------|
| `inbox[]` | Loaded via `loadModuleForTab('inbox')` |
| `selectedInboxMessage` | Click selection |
| `responseReplyText` | Composer |
| Handlers | AI suggest + send |
| Search | Shared App `searchQuery` |

## New owner

`src/features/inbox/pages/InboxPage.tsx`

- Owns list query, selection, composer, mutations.
- Accepts optional `searchQuery` from App header (read-only input), not list ownership.
- No polling interval.

## Sidebar

Unread uses `navigationCounts.pendingInbox` (bootstrap/counts), not full inbox list.
