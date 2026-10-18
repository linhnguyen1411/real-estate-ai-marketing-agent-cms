# BẢNG ĐỐI CHIẾU NGUỒN BẰNG CHỨNG (SOURCE REGISTRY)
**Mã tài liệu:** `RAG-SRC-10`  
**Ngày cập nhật:** 17/10/2026

---

## BẢNG TRA CỨU BẰNG CHỨNG XÁC MINH THEO TỪNG CHỨC NĂNG

| Mã tính năng / Khẳng định | Tệp mã nguồn Backend | Tệp giao diện Frontend | Mô hình Database (Prisma) | Bằng chứng kiểm thử / Live |
| :--- | :--- | :--- | :--- | :--- |
| **Đăng ký & Mã giới thiệu** | `server/modules/auth/authRoutes.ts`, `server/modules/team/teamService.ts` | `src/features/auth/LoginPage.tsx`, `src/components/admin/AdminProfilePanel.tsx` | `User.referralCode`, `Team`, `TeamMember` | Kiểm thử thành công mã `REF-UOWNER`, DB có 28 users, 10 teams. |
| **Phê duyệt Thành viên Team** | `server/modules/team/teamRoutes.ts` | `src/App.tsx` (Tab Team) | `TeamMember.status = 'approved'`, `TeamMember.approvedBy` | Giao diện hiển thị danh sách Pending và nút Approve. |
| **Ma trận Phân quyền 2D** | `server/modules/rbac/rbacAdminRoutes.ts`, `server/modules/rbac/rbacRepository.ts` | `src/components/admin/RbacManagementPanel.tsx` | `RolePermission` (150 bản ghi) | Đã deploy lên `bdsdanang.site`, tick checkbox lưu tức thì. |
| **Quản trị BĐS & Nguồn tin** | `server/modules/properties/propertiesRoutes.ts`, `server/dbHelper.ts` | `src/features/properties/pages/PropertiesPage.tsx` | `CmsRecord (collection='properties')` | 26 tin BĐS trong DB, trường `listing_source: 'broker'|'owner'`. |
| **Desktop Tool Cài Đặt** | `server/modules/license/licenseRoutes.ts` | `public/downloads/HouseAndLife-Agent-Setup.exe` | `LicenseKey`, `LicenseDevice` | HTTP 200 OK tải file 175MB tại `https://bdsdanang.site/downloads/HouseAndLife-Agent-Setup.exe`. |
| **Cổng Tìm Kiếm Công Khai** | `server/modules/public-site/publicSiteRoutes.ts` | `src/main.tsx`, `src/ListingsPage.tsx` | `CmsRecord` | `GET https://bdsdanang.site/api/public/properties` -> 200 OK. |
| **Executive Dashboard** | `server/modules/executive-dashboard/executiveService.ts` | `src/features/dashboard/components/ExecutiveKpiGrid.tsx` | `Lead`, `CmsRecord`, `AgentFinding` | Dọn sạch dữ liệu ảo, hiển thị số liệu thực từ database. |
| **Radar Lead Intelligence** | `server/agent/agentRoutes.ts`, `server/modules/lead-acquisition` | `src/pages/AgentPlatformPage.tsx` | `AgentFinding`, `ScannedContent` | 1,141 bản ghi Finding thực tế trong PostgreSQL. |
