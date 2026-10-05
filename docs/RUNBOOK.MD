# Sổ Tay Vận Hành & Khắc Phục Sự Cố (Production Runbook)

Tài liệu này hướng dẫn các thao tác vận hành hàng ngày, quy trình triển khai phiên bản mới, sao lưu, phục hồi dữ liệu và xử lý các sự cố khẩn cấp.

---

## 1. Quy Trình Triển Khai (Deployment Workflow)

> [!IMPORTANT]
> TUYỆT ĐỐI KHÔNG sử dụng `prisma db push` trên môi trường VPS hoặc Production. Chỉ sử dụng `prisma migrate deploy` để đảm bảo dữ liệu không bị xóa ngoài ý muốn.

### 1.1 Chuẩn Bị Trước Khi Deploy (Pre-flight Checks)
1. Kiểm tra build và typecheck trên local:
   ```bash
   npm run lint
   npm test
   npm run build
   ```
2. Đảm bảo toàn bộ migration file mới đã được sinh ra và review:
   ```bash
   npx prisma migrate status
   ```

### 1.2 Triển Khai An Toàn Lên VPS
Sử dụng script `deploy-safe.ps1`:
```powershell
# Chạy với biến môi trường hoặc truyền -HostName
$env:VPS_HOST = "your.vps.ip.or.domain"
npm run deploy:safe

# Hoặc truyền tham số trực tiếp
.\scripts\deploy-safe.ps1 -HostName "your.vps.ip.or.domain"
```
Quy trình tự động thực hiện:
- Tự động tạo backup DB trên VPS trước khi áp dụng thay đổi.
- Đóng gói mã nguồn và upload lên thư mục đích.
- Chạy `prisma migrate deploy` để áp dụng các migration mới.
- Build và reload PM2 instance với zero-downtime (`pm2 reload`).
- Kiểm tra endpoint `/api/health` đảm bảo server hoạt động ổn định.

---

## 2. Quy Trình Rollback Khẩn Cấp (Emergency Rollback)

Khi phiên bản mới phát sinh lỗi nghiêm trọng sau khi triển khai:

1. **Rollback Mã Nguồn & PM2:**
   - Kết nối SSH vào VPS.
   - Trỏ symlink hoặc giải nén bản backup gần nhất trong `/var/www/real-estate-ai-cms/backups/`:
     ```bash
     cd /var/www/real-estate-ai-cms
     # Khôi phục bản dist trước đó
     tar -xzf backups/dist-<TIMESTAMP>.tar.gz
     pm2 restart real-estate-ai-cms
     ```

2. **Rollback Cơ Sở Dữ Liệu (Nếu Schema Thay Đổi Bị Lỗi):**
   - Khôi phục từ file dump `.sql.gz` đã sao lưu trước đó:
     ```bash
     zcat backups/db-<TIMESTAMP>.sql.gz | psql "$DATABASE_URL"
     ```

---

## 3. Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)

### 3.1 Sao Lưu Từ Xa (Remote Backup)
Thực hiện từ máy quản trị viên:
```powershell
.\scripts\backup-prod.ps1 -HostName "your.vps.ip.or.domain" -DownloadLocal
```
Bản dump cơ sở dữ liệu và thư mục uploads sẽ được lưu tại `data/backups/`.

### 3.2 Khôi Phục Dữ Liệu Local Phục Vụ Thử Nghiệm
```powershell
.\scripts\pull-prod-db.ps1 -HostName "your.vps.ip.or.domain"
npm run db:setup-local
```

---

## 4. Giám Sát & Xem Nhật Ký Lỗi (Monitoring & Logs)

### 4.1 Xem Nhật Ký Ứng Dụng (Application Logs)
Server sử dụng thư viện Pino log định dạng JSON có cấu trúc:
```bash
# Xem log trực tiếp qua PM2
pm2 logs real-estate-ai-cms --lines 100

# Lọc các log có mức độ cảnh báo (warn/error)
pm2 logs real-estate-ai-cms --raw | grep -E '"level":(40|50|60)'
```

### 4.2 Kiểm Tra Trạng Thái Sức Khỏe (Health Check)
```bash
curl -I https://bdsdanang.site/api/health
```
Kết quả mong muốn: `HTTP/1.1 200 OK` kèm thông tin gateway status và database connectivity.

---

## 5. Dọn Dẹp Dữ Liệu Định Kỳ (Data Retention Job)

Hệ thống cung cấp job dọn dẹp các đoạn chat cũ (`chat_history` và `public_chat_guests`) theo thời gian lưu trữ `RETENTION_DAYS` (mặc định 180 ngày):

```bash
# Kiểm tra số lượng bản ghi sẽ xóa (Dry Run)
node -e "import('./server/dataLifecycle/retentionJob.js').then(m => m.runDataRetentionCleanup({ dryRun: true })).then(console.log)"

# Thực thi dọn dẹp thực tế
node -e "import('./server/dataLifecycle/retentionJob.js').then(m => m.runDataRetentionCleanup({ dryRun: false })).then(console.log)"
```
