# API Catalog (Agent + related)

**Date:** 2026-07-14 · `72d9eb6`  
**Rule:** Do not remove APIs with live callers. Deprecate first.

## `/api/agent/*` (session auth)

Sources, missions, jobs, contents, findings, external inventory, proposals, notifications, sessions, reports, settings/sync helpers, approve-finding. Callers: CMS agent UI. Coverage: `test:agent-api` + domain tests.

## `/api/agent-ingest/v1/*` (HMAC)

`events`, `events/batch`, credential admin. Coverage: `test:agent-ingestion-api`.

## Sync (internal)

Outbox → `vpsClient` remote ingest. Coverage: `test:agent-sync-outbox`.

## Graph Facebook

| Surface | Status |
|---------|--------|
| `/webhooks/facebook` | active legacy |
| Admin Graph APIs | live; UI unmounted |

## Gaps

Pagination on large findings/contents lists — verify before R7. Tenant=`companyId` — needs isolation regression. Never return sync/bot secrets.
