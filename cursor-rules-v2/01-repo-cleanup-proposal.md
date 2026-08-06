# Repo Cleanup Proposal — docs/ + scripts/ + dead code
Repo: `real-estate-ai-marketing-agent-cms` · Snapshot date: 2026-08-06

Hiện trạng: **206 file trong `docs/`**, **254 file trong `scripts/`**. Phần lớn là báo cáo/log
một-lần của các đợt refactor/deploy trước đây (R0/R1/R2, BATCH2-6, MISSION-2-*, RELEASE-H2.*...),
không phải hướng dẫn vận hành còn dùng lại được. Đề xuất dưới đây lọc theo đúng tiêu chí Linh đưa ra:
**chỉ giữ doc/script phục vụ (a) setup CDP Chrome, (b) start & deploy code, (c) backup data.**

---

## 1. Docs — giữ lại (5 file, evergreen operational guide)

| File | Lý do giữ |
|---|---|
| `scripts/fleet/README.md` | Hướng dẫn bootstrap Chrome CDP + scan worker — đúng "cdp chrome setup" |
| `docs/engineering/RELEASE_PROCESS.md` | Quy trình release/deploy chính thức |
| `docs/refactor/DATA-RETENTION-POLICY.md` | Chính sách backup/retention dữ liệu, đi kèm `npm run cleanup:db-tech-retention` |
| `POSTGRES_SETUP.md` (root) | Setup Postgres — nền tảng cho cả backup/restore lẫn dev start |
| `docs/runtime/BROWSER-LIFECYCLE.md` | Giải thích vòng đời browser CDP lúc runtime — tài liệu tham chiếu khi debug script chrome |

> Lưu ý: `docs/engineering/ENGINEERING_CONSTITUTION.md` và `PROJECT_STRUCTURE.md` **không** nằm trong
> nhóm "operational guide" này — chúng được xử lý riêng ở đề xuất rules mới (file `02-*`), vì đang bị
> rules ép đọc toàn bộ trên mọi request.

## 2. Docs — archive (~201 file còn lại)

Gom theo nhóm, không xoá thẳng — chuyển vào `docs/archive/<nhóm>/` để còn tra cứu khi cần, nhưng loại
khỏi mọi thứ Cursor có thể tự động đọc:

| Nhóm | Số file | Ví dụ | Bản chất |
|---|---:|---|---|
| `docs/refactor/*` (trừ DATA-RETENTION-POLICY) | ~24 | R0/R1/R2-*, BASELINE, STABILIZATION-REPORT | Báo cáo 1 lần của đợt refactor đã xong |
| `docs/architecture/*` | ~45 | BATCH2-6-*, FLEET-*, EXECUTION-*, CONTROL-PLANE.md | Snapshot kiến trúc automation platform tại 1 thời điểm |
| `docs/production/*`, `docs/release/*`, `docs/mission-engine/*` | ~20 | BURN-IN-CHECKLIST, RELEASE-H2.x, MISSION-2-* | Log vận hành/rollout đã chốt, có ngày tháng cụ thể |
| `docs/telegram/*`, `docs/publishing/*`, `docs/automation/*` | ~25 | TELEGRAM-*, FACEBOOK-*-ADAPTER, CAMPAIGN-ENGINE | Tài liệu tính năng — hữu ích khi sửa đúng module đó, không cần load mặc định |
| `docs/audit/*` | 3 | SYSTEM-AUDIT, TECHNICAL-DEBT, ARCHITECTURE-STATUS | Bị thay thế bởi chính đề xuất này |
| Top-level `docs/*.md` | ~20 | AI-AGENT-*, SEO-AUDIT, PAGESPEED-AUDIT, UI-REBRAND | Audit tính năng cũ, không phải setup guide |
| `docs/adr/*` | 8 | ADR-001..007 | **Ngoại lệ nên cân nhắc riêng** — ADR ghi lại quyết định kiến trúc không đổi (vd. stateless execution, browser lease). Xoá/ẩn hết có thể mất lý do "tại sao" đằng sau code. Đề xuất: giữ nguyên `docs/adr/` như kho quyết định, nhưng **không** để rule nào tự động đọc hết 8 file mỗi request (xem file `02-*`) |
| Còn lại (leads/, media/, ai/, ai-scanner-2/, roadmap/, ui/, testing/, performance/, admin/, prompts/, evolution/, engineering/CODE_REVIEW_CHECKLIST.md, engineering/README.md) | ~55 | | Tài liệu tính năng/nội bộ — archive theo nhóm |

**Lệnh gợi ý** (chạy thử `--dry-run` bằng git mv, review trước khi push):

```bash
mkdir -p docs/archive/{refactor,architecture,production-release,feature-reports,audit,adr}
git mv docs/refactor docs/archive/refactor        # trừ DATA-RETENTION-POLICY.md, mv riêng ra ngoài trước
git mv docs/architecture docs/archive/architecture
git mv docs/production docs/release docs/mission-engine docs/archive/production-release/
git mv docs/audit docs/archive/audit
# ADR: cân nhắc giữ nguyên vị trí, chỉ thôi auto-load — xem 02-cursor-rules
```

---

## 3. Scripts — giữ lại (~25 file, wired vào chrome/start/deploy/backup)

| Nhóm | File |
|---|---|
| Chrome CDP | `scripts/fleet/start-cdp-chrome.sh`, `.ps1`, `scripts/fleet/start-scan-worker.sh`, `.ps1`, `scripts/check-facebook-session.ts` |
| Dev start | `scripts/free-dev-ports.mjs`, `scripts/ensure-local-pg.mjs`, `scripts/start-production.cjs` |
| Deploy | `scripts/deploy-safe.ps1` (bản an toàn, dùng chính) |
| DB setup/backup | `scripts/setup-local-db.ps1`, `scripts/pg-cluster.ps1`, `scripts/bootstrap-vps-db.ps1`, `scripts/vps-bootstrap-postgres.sh`, `scripts/pull-prod-db.ps1`, `scripts/sync-prod-db.mjs`, `scripts/backup-prod.ps1`, `scripts/remote-backup.sh` |
| Retention (đi kèm backup policy) | `scripts/cleanup-db-tech-retention.mjs`, `scripts/cleanup-agent-runtime.mjs` |
| Build preflight | `scripts/check-assets.mjs` |

⚠️ **1 vấn đề cần Linh quyết định ngay:** `scripts/deploy.ps1` chạy `prisma db push --accept-data-loss`
— rủi ro mất dữ liệu — đã được `docs/refactor/DEAD-CODE-CANDIDATES.md` gắn cờ từ trước nhưng
`npm run deploy` (không phải `deploy:safe`) **vẫn** trỏ vào nó. Đề xuất: xoá hẳn `deploy.ps1`, đổi
`npm run deploy` để trỏ sang `deploy-safe.ps1`, hoặc archive `deploy.ps1` và cập nhật `package.json`
ngay để tránh ai chạy nhầm `npm run deploy`.

## 4. Scripts — archive/xoá (~225 file)

| Nhóm | Số file | Bằng chứng |
|---|---:|---|
| `scripts/tmp-*` | 56 | Tự đặt tên "tmp" — chính là scratch của các phiên debug production trước, nên archive/xoá thẳng |
| `scripts/_*` (underscore) | 13 | Tương tự — scratch inspect/requeue 1 lần |
| `scripts/test-*.ts` gắn theo mã ticket (h243, h244…h249) | ~20 | Test thủ công cho 1 tính năng cụ thể lúc phát triển, không phải test suite (không dùng jest/vitest), giờ đã merge xong |
| `scripts/test-*` còn lại | ~70 | Cùng bản chất — smoke/manual verification. **2 bằng chứng cụ thể cho thấy đã rot**: `"test:scanner-v2"` và `"test:agent-spam-control"` trỏ **cùng 1 file** `test-agent-spam-control.ts`; `"test:publisher-production"` và `"test:social-publishing"` cũng trỏ cùng file `test-social-publishing.ts` — copy-paste khi thêm script mới, không ai dọn lại |
| `scripts/smoke-*` | 11 | Cùng nhóm test thủ công |
| `scripts/diag*`, `diagnose*` | 5 | Ops diagnostic — giữ lại nếu vẫn dùng khi debug prod, nếu không thì archive |
| `backfill-*`, `migrate-*`, `recover-*`, `purge-*`, `fix-*` | ~15 | Script chạy 1 lần cho 1 lần migrate/fix dữ liệu cụ thể đã xong — archive, không xoá hẳn (có thể cần tham khảo lại logic nếu bug tái diễn) |
| `scripts/deploy.ps1` | 1 | Xem mục 3 — xử lý riêng |

**Lệnh gợi ý:**

```bash
mkdir -p scripts/archive/{tmp,scratch,manual-tests,one-off-migrations}
git mv scripts/tmp-*.* scripts/archive/tmp/
git mv scripts/_*.ts scripts/archive/scratch/
git mv scripts/test-h2*.ts scripts/archive/manual-tests/
git mv scripts/backfill-*.ts scripts/migrate-*.ts scripts/recover-*.ts scripts/purge-*.ts scripts/archive/one-off-migrations/
```

Sau khi move, chạy `npm run lint` (tsc --noEmit) + `npm run build` để chắc chắn không script nào còn
được import chéo bởi code khác (một vài `test-*.ts` có thể được require bởi script khác — nên check
từng cái bằng `grep -rl "scriptName" server/ src/ scripts/` trước khi move).

## 5. Package.json — dọn theo

Sau khi archive, xoá luôn entry `scripts` tương ứng trong `package.json` (đặc biệt 2 cặp trùng lặp ở
mục 4) để `npm run` không còn liệt kê lệnh chết.
