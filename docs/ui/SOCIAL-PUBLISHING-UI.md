# Social Publishing UI

Phase **UI1** — management UI for Social Publishing. Reuses existing `/api/social/*` services; no changes to Automation Engine, Mission Runtime, Worker Runtime, or Browser Runtime business logic.

## Feature modules (lazy)

| Menu | Route | Module |
|------|-------|--------|
| Lịch đăng | `/admin/agents/publishing` | `publishing-schedule` |
| Bản nháp | `/admin/agents/publishing/drafts` | `publishing-drafts` |
| Kênh đăng | `/admin/agents/publishing/channels` | `publishing-channels` |
| Lịch sử đăng | `/admin/agents/publishing/history` | `publishing-history` |
| Campaign | `/admin/agents/publishing/campaigns` | `publishing-campaigns` |

Each menu is a separate feature page, lazy-loaded from `AgentPlatformPage`. Shared chrome lives in `social-publishing/shared` (subnav + job helpers). **App.tsx has no publishing logic.**

## Capabilities by menu

### 1. Kênh đăng
- Destination list (`facebook_profile` → Timeline, `facebook_group` → Group, `facebook_page`)
- Status, last publish, test connection, enable/disable
- Capabilities from `GET /api/social/destinations` (registry presets)

### 2. Bản nháp
- List, preview, edit
- AI regenerate (`POST .../regenerate` → pending_review copy), duplicate, approve, archive/delete
- Schedule / publish now (existing draft APIs)

### 3. Lịch đăng
- Month calendar + Upcoming / Running / Completed / Failed
- Drag-and-drop reschedule (`PATCH /api/social/jobs/:id/reschedule`)
- Publish Now (`POST /api/social/jobs/:id/publish-now`)
- Cancel / retry

### 4. Lịch sử đăng
- Publish log + attempt timeline
- Evidence (manifest, screenshot, HTML snapshot paths)
- Permalink, duration, retry, secondary audit

### 5. Campaign
- Campaign list with progress (target count, success, failed, partial_success)
- Create / start / open campaign detail
- Wraps `campaignService` via thin HTTP routes (no new fan-out logic)

## API surface used (thin wrappers only where service already existed)

| UI need | Endpoint |
|---------|----------|
| Destinations / capabilities | `GET /api/social/destinations` |
| Draft duplicate / regenerate / archive | `POST /api/social/drafts/:id/{duplicate,regenerate,archive}` |
| Job reschedule / publish-now | `PATCH .../reschedule`, `POST .../publish-now` |
| Evidence | `GET /api/social/jobs/:id/evidence`, `GET /api/social/evidence-file` |
| Campaigns | `GET/POST /api/social/campaigns`, `GET .../:id`, `POST .../:id/start`, run refresh |

Existing channel/draft/job/attempt/audit routes unchanged in behavior.

## Ownership rules

- **No duplicate server state** — UI reads jobs/drafts/channels/campaigns from API only.
- **Lazy load** — one feature chunk per menu via `React.lazy` + `Suspense`.
- **No App.tsx publishing handlers** — routing stays in `main.tsx` / sidebar / `AgentPlatformPage`.

## Tests

```bash
npm run lint
npm run build
npm run test:frontend-architecture
npm run test:social-publishing-ui
```
