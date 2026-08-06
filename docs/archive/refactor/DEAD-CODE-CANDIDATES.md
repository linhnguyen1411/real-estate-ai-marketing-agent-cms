# Dead Code Candidates

> Protect migrations, Graph Facebook, mapped package scripts, PM2/safe-deploy, dynamic imports, profiles, backups.  
> Date: 2026-07-14 — `feature/refactor` @ `72d9eb6`.

| Path | Evidence | Risk | Action | Tests after | Conf |
|------|----------|------|--------|-------------|------|
| `src/main-new.tsx` | Not in index.html | low | delete | lint/build | high |
| `src/ListingsPageNew.tsx` | Only via main-new | low | delete | lint/build | high |
| `src/components/admin/FacebookPanel.tsx` | Unmounted | med | deprecate keep | webhook | med |
| `src/services/facebookApi.ts` | Panel-only | med | keep with panel | webhook | med |
| `scripts/probe-*.mjs`, `_tmp-probe-feed.mjs` | Not in package.json | low | archive | FB parser tests | high |
| `scripts/tmp-vps-*` except `tmp-vps-safe-deploy.sh` | One-off | med | archive | ops | high/med |
| `scripts/tmp-vps-safe-deploy.sh` | Used by deploy-safe.ps1 | high if deleted | **keep** | safe deploy | high |
| `backend/app.py`, `backend/app.rb` | Unmounted | low | archive | build | high |
| `scripts/deploy.ps1` | db push --accept-data-loss | high ops | deprecate | — | high |
| `scripts/deploy-safe.ps1` | Safer; npm deploy:safe still calls deploy.ps1 | high miswire | keep + fix script later | — | high |
| Dual contentNormalizer | Different APIs | med | investigate R1 | classification + website | keep |
| `motion` npm | Zero imports | low | remove after build | build | high |
| `FACEBOOK_GRAPH_LEGACY_ENABLED` | Unread; webhook always on | misconfig | document; keep Graph | webhook | high |
| `AGENT_ENABLED` | Unread gate | low | document | — | high |

## This phase deletes

- Generated: cleanup:agent-runtime after dry-run  
- Code: main-new + ListingsPageNew  
- Optional dep: motion  
- Archive: probes + most tmp-vps (never safe-deploy)
