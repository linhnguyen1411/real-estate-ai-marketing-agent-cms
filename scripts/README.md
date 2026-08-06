# scripts/ — ops only

Chỉ giữ script vận hành. Chi tiết lệnh hàng ngày → `docs/RUNBOOK.MD`.

| Nhóm | File |
|------|------|
| Local | `free-dev-ports.mjs`, `ensure-local-pg.mjs`, `pg-cluster.ps1`, `setup-local-db.ps1`, `restart-dev.ps1` |
| Deploy / start | `deploy-safe.ps1`, `deploy.ps1`, `start-production.cjs` |
| Backup / DB | `backup-prod.ps1`, `remote-backup.sh`, `pull-prod-db.ps1`, `sync-prod-db.mjs`, `bootstrap-vps-db.ps1`, `vps-bootstrap-postgres.sh` |
| Agent ops | `check-facebook-session.ts`, `diagnose-agent-runtime.mjs`, `automation-cli.ts`, `cleanup-*.mjs` |
| Fleet | `fleet/start-cdp-chrome.*`, `fleet/start-scan-worker.*` |
| Gate | `test-deploy-safety.mjs` |

Một lần / test / probe cũ → `scripts/archive/` (không gọi từ npm).
