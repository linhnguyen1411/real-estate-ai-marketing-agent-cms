# Release H2.1 — Campaign Workspace

**Date:** 2026-07-25  
**Feature commit:** `b7acb7e` — `feat(campaign): introduce campaign workspace as ai sales operating center`  
**Release commit:** `chore(release): deploy campaign workspace h2.1`  
**Host:** `bdsdanang.site` / VPS `112.213.87.124`  
**App path:** `/var/www/real-estate-ai-cms`

## Objective

Deploy Campaign Workspace (H2.1) to VPS for live operator testing: compose-only campaign OS surface across Admin, Copilot, Telegram, and Executive — without touching Runtime / Fleet / Queue / Browser cores.

## Deploy Result

| Step | Result |
|------|--------|
| Git audit | Clean tree on H2.1 feature commit; no junk uploaded |
| Backup | `backups/db-20260725-095723.sql`, `dist-20260725-095723.tar.gz`, `env-20260725-095723.bak` |
| Local build | `npm run build` PASS |
| Upload / extract | Safe deploy path |
| Prisma migrate deploy | Applied |
| Remote build | PASS |
| PM2 | `real-estate-ai-cms` online + `pm2 save` |
| Health | `GET /api/health` → `status: success`, scheduler running |

## Smoke Result

Utterance: **Hôm nay bán mạnh Mai Đăng Chơn [h2.1-release-smoke]**

| Check | Result |
|-------|--------|
| Campaign tạo | PASS |
| Research | PASS |
| Mission | PASS (7 đề xuất) |
| Keyword | PASS |
| Content | PASS (plan/slots present; 0/6 approved — expected waiting_approval) |
| Trace | PASS |
| Workspace API compose | PASS |
| Health derive | PASS (`critical` score 57 — price-band signal, not deploy failure) |
| Telegram / Dashboard / Copilot | Shipped in bundle (enriched campaign card + `campaign_workspace` intent + executive health); live UI exercised via workspace compose |

`SMOKE_PASS` — hard gates campaign + workspace + health all green.

## Known Issues

- Campaign health can surface **critical** when price-band / publish-approval signals fire — expected product signal, not a release regression.
- Public Campaign API requires auth (401 without session) — smoke ran server-side via `tsx` on VPS.
- Content approval count may be 0 until operator approves — campaign stays `waiting_approval`.

## Cleanup

- Test campaign tagged `h2.1-release-smoke` deleted.
- Remaining marker campaigns on VPS: **0**.
- Temporary smoke scripts removed from local + VPS (not committed).

## Verdict

**GO** — H2.1 Campaign Workspace deployed and smoke-verified on production VPS.
