# VAI TRÒ NGƯỜI DÙNG & HỆ THỐNG PHÂN QUYỀN (ROLES & PERMISSIONS)
**Mã tài liệu:** `RAG-RBAC-02`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`  
**Nguồn bằng chứng:** `server/modules/rbac/rbacTypes.ts`, `server/modules/rbac/rbacService.ts`

---

## 1. NĂM VAI TRÒ CHÍNH TRONG HỆ THỐNG

| Mã vai trò (`roleKey`) | Tên hiển thị tiếng Việt | Mô tả & Trách nhiệm | Cách thức xác lập |
| :--- | :--- | :--- | :--- |
| `super_admin` | Quản trị viên Tối cao | Toàn quyền kiểm soát hệ thống, cơ sở dữ liệu, ma trận phân quyền, quản lý gói dịch vụ và hạ tầng máy chủ. | Tài khoản khởi tạo hệ thống (mặc định sở hữu Team Root). |
| `team_lead` | Trưởng nhóm Kinh doanh | Quản lý đội ngũ sale cấp dưới, duyệt thành viên, phân phối giỏ hàng trong nhóm và giám sát hiệu quả kinh doanh của Team. | Là chủ của một mã giới thiệu khi có người khác nhập mã đăng ký vào nhóm. |
| `member` | Chuyên viên Kinh doanh (Chính thức) | Đăng tin cá nhân, xem và chào bán giỏ hàng được Team Lead phân phối, chăm sóc tệp khách hàng được phân công. | Thành viên đăng ký có mã giới thiệu và đã được Trưởng nhóm bấm **Duyệt**. |
| `independent` | Môi giới Độc lập | Hoạt động độc lập không thuộc nhóm nào. Toàn quyền quản lý kho hàng và khách hàng của chính mình. | Người dùng tự đăng ký tài khoản nhưng không điền mã giới thiệu. |
| `pending_member` | Thành viên Chờ duyệt | Trạng thái tạm thời của chuyên viên mới đăng ký có mã giới thiệu, đang chờ Trưởng nhóm phê duyệt vào team. | Tự động gán ngay sau khi hoàn tất đăng ký có kèm mã giới thiệu. |

---

## 2. NGUYÊN TẮC PHÂN QUYỀN THEO PHẠM VI DỮ LIỆU (DATA SCOPE)

Quyền hạn trong hệ thống không chỉ là Có/Không (Boolean), mà gắn liền với **Phạm vi dữ liệu (Scope)**:

1. **`all` (Toàn hệ thống):** Thao tác trên dữ liệu của mọi tài khoản và mọi nhóm trên toàn bộ nền tảng.
2. **`team` (Nội bộ Team):** Chỉ thao tác trên dữ liệu thuộc các thành viên trong cùng một Đội nhóm.
3. **`own` (Cá nhân):** Chỉ thao tác trên dữ liệu do chính tài khoản của mình tạo ra hoặc được đích danh giao cho mình.
4. **`none` (Không có quyền):** Chặn hoàn toàn, không hiển thị chức năng trên menu và trả lỗi 403 Forbidden nếu gọi API.

---

## 3. BẢNG TỔNG HỢP MA TRẬN 30 QUYỀN HẠN MẶC ĐỊNH

| Nhóm chức năng | Tên quyền hạn (`permissionKey`) | Super Admin | Team Lead | Member (Duyệt) | Member (Chờ) | Độc lập |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Tổng quan** | `dashboard` (Xem bảng điều hành) | `all` | `team` | `own` | `none` | `own` |
| **Giỏ hàng BĐS** | `property.read` (Xem giỏ hàng) | `all` | `team` | `team` | `own` | `own` |
| | `property.write` (Tạo/Sửa BĐS) | `all` | `team` | `own` | `own` | `own` |
| | `property.distribute` (Giao giỏ hàng) | `all` | `team` | `none` | `none` | `none` |
| **AI & Công cụ** | `chatbot.use` (Trợ lý AI nội bộ) | `all` | `team` | `own` | `none` | `own` |
| | `shortlink.manage` (Tạo link tiếp thị) | `all` | `team` | `own` | `none` | `own` |
| | `tool.download` (Tải Tool EXE) | `own` | `own` | `own` | `none` | `own` |
| **Đội nhóm** | `team.members.manage` (Duyệt nhân sự) | `all` | `team` | `own` | `none` | `own` |
| | `team.permissions.edit` (Sửa quyền team) | `all` | `team` | `none` | `none` | `none` |
| **Hệ thống** | `rbac.matrix` (Sửa ma trận phân quyền) | `all` | `none` | `none` | `none` | `none` |
| | `entitlement` (Cấp gói tính năng) | `all` | `none` | `none` | `none` | `none` |
| | `license.manage` (Cấp License Key) | `all` | `none` | `none` | `none` | `none` |
| | `user.manage` (Quản lý User) | `all` | `team` | `none` | `none` | `none` |
| | `settings.system` (Cấu hình hệ thống) | `all` | `none` | `none` | `none` | `none` |
| **Gói Nâng Cao ($)**| `crm` (Khách hàng CRM) | `all` | `team` ($) | `team` ($) | `none` | `own` ($) |
| | `investor_leads` (Leads đầu tư) | `all` | `team` ($) | `team` ($) | `none` | `own` ($) |
| | `fb_inbox` (Hộp thư Facebook đa kênh) | `all` | `team` ($) | `team` ($) | `none` | `own` ($) |
| | `lead.intel` (Radar phát hiện Lead AI) | `all` | `team` ($) | `team` ($) | `none` | `own` ($) |
| | `agent.sources` / `agent.runtime` | `all` | `team` ($) | `team` ($) | `none` | `own` ($) |

*Ghi chú:* Ký hiệu `($)` thể hiện quyền hạn này yêu cầu tài khoản cá nhân hoặc đội nhóm phải sở hữu Gói tính năng Premium còn hiệu lực (Entitlement).

---

## 4. QUY TẮC BẢO VỆ ĐẶC BIỆT (SECURITY GUARDRAILS)

1. **Bảo toàn quyền hạn tối cao:** Super Admin không thể tự hủy quyền quản trị của chính mình trên ma trận để chống nguy cơ hệ thống mất kiểm soát.
2. **Quy tắc thu hẹp quyền (Narrow Scope):** Trưởng nhóm có thể cấu hình hạn chế bớt quyền của nhân viên trong nhóm mình, nhưng **tuyệt đối không thể nới rộng** quyền hạn vượt quá mức trần do Super Admin quy định.
3. **Thành viên Chờ duyệt (Pending Member):** Tuyệt đối bị khóa khỏi các tính năng nhạy cảm (CRM chung, giỏ hàng nội bộ của Team, Radar tìm kiếm khách hàng) cho đến khi có sự phê duyệt chính thức từ Team Lead.
