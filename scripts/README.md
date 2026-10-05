# Operational Scripts Guide (`scripts/`)

Thư mục này chứa các script phục vụ vận hành, bảo trì cục bộ và triển khai hệ thống CMS & AI Agent.

---

## 1. Phân Loại Script

### 1.1 Local Development & Database Cluster
- `free-dev-ports.mjs`: Giải phóng các port đang bị chiếm dụng (3000, 5432, 9222) khi dev server crash.
- `ensure-local-pg.mjs`: Khởi động và bảo đảm PostgreSQL instance local sẵn sàng.
- `pg-cluster.ps1` / `setup-local-db.ps1`: Khởi tạo và thiết lập schema DB cho môi trường local.
- `restart-dev.ps1`: Tái khởi động môi trường dev cục bộ an toàn.

### 1.2 Triển Khai (Deploy) & Vận Hành
- `deploy-safe.ps1`: Script triển khai an toàn lên VPS Production (sử dụng `prisma migrate deploy`, TUYỆT ĐỐI KHÔNG dùng `db push`). Yêu cầu truyền `-HostName` hoặc thiết lập `$env:VPS_HOST`.
- `start-production.cjs`: Entrypoint production server runner với error handling và clustering.
- `tmp-vps-safe-deploy.sh`: Script thực thi trên VPS trong quá trình triển khai bundle an toàn.

### 1.3 Sao Lưu & Đồng Bộ Dữ Liệu
- `backup-prod.ps1`: Sao lưu PostgreSQL và static uploads trên VPS từ xa thông qua SSH. Yêu cầu truyền `-HostName` hoặc thiết lập `$env:VPS_HOST`.
- `pull-prod-db.ps1`: Tải bản dump DB từ VPS về local phục vụ debug (đã loại bỏ IP hardcode).
- `remote-backup.sh`: Bash script thực hiện sao lưu định kỳ qua cron trên máy chủ.
- `sync-prod-db.mjs`: Hỗ trợ đồng bộ an toàn cấu trúc bảng.

### 1.4 AI Agent & Worker Operations
- `automation-cli.ts`: Công cụ dòng lệnh tương tác và kiểm tra agent nhiệm vụ.
- `check-facebook-session.ts`: Kiểm tra tình trạng cookie / session của Facebook page & profile.
- `diagnose-agent-runtime.mjs`: Chẩn đoán trạng thái worker và port kết nối CDP.
- `cleanup-agent-runtime.mjs`: Dọn dẹp các artifact, screenshots và cache tạm của agent.
- `cleanup-db-tech-retention.mjs`: Dọn dẹp log kỹ thuật cũ theo chính sách retention.

### 1.5 Thư Mục Archive (`scripts/archive/`)
Toàn bộ các test script thăm dò cũ, script migration 1 lần (one-off probes, legacy benchmarks) đã được chuyển vào `scripts/archive/`.
- Không được import hoặc gọi trực tiếp từ production code hay `package.json`.
- Chỉ lưu giữ làm tài liệu tham khảo lịch sử phát triển.
