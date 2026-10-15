# RBAC v2 — Team/Referral, Giỏ hàng, Premium, License (đã chốt quyết định)

Thay thế mục 2, 3, 6, 7, 8 của RBAC-AUDIT-PLAN.md. Mục 1 (lỗi bảo mật S1-S7) và prompt P0 giữ nguyên: **làm P0 trước khi mở đăng ký**.

## 0. Quyết định đã chốt
1. Đăng ký không mã → user độc lập (không team). Có mã → vào team của chủ mã; chủ mã = Team Lead, được chỉnh mức access của team.
2. Sale mới vào team: trạng thái `pending`, chỉ được truy cập giỏ hàng của chính mình (tạo/sửa/xem tin mình đăng). Được duyệt (`approved`) → Team Lead phân phối giỏ hàng cho. Quyền sở hữu giỏ hàng mặc định thuộc người tạo; chia hoa hồng làm sau. Mỗi tin có tick **Môi giới / Chính chủ**.
3. CRM, Leads đầu tư, Inbox Facebook: mặc định chỉ Super Admin + team root. Người khác tuỳ gói premium do Super Admin cấp.
4. Team root = team của Super Admin, duy nhất toàn platform, chỉ 1 team vào được bằng mã của Super Admin.
5. Premium có 2 cấp: **cá nhân** hoặc **team**, Super Admin cấu hình và phân phối.

Giả định mình tự đặt (sửa nếu sai): (a) mọi user đều có sẵn mã referral, team chỉ được tạo khi có người đầu tiên nhập mã; (b) role `company_admin` hiện tại ngừng dùng cho luồng mới, giữ lại để tương thích; (c) "Môi giới / Chính chủ" là chọn 1 trong 2 (bắt buộc), tin cũ để trống đến lần sửa tiếp theo.

## 1. Mô hình dữ liệu

```prisma
model Team {
  id              String   @id @default(cuid())
  leadUserId      String   @unique @map("lead_user_id")   // chủ mã
  referralCode    String   @unique @map("referral_code")
  isPlatformRoot  Boolean  @default(false) @map("is_platform_root")  // duy nhất 1 (partial unique index)
  createdAt       DateTime @default(now()) @map("created_at")
  @@map("teams")
}

model TeamMember {
  teamId      String   @map("team_id")
  userId      String   @unique @map("user_id")          // 1 user chỉ thuộc 1 team
  status      String   // pending | approved | suspended
  approvedBy  String?  @map("approved_by")
  joinedAt    DateTime @default(now()) @map("joined_at")
  @@id([teamId, userId])
  @@map("team_members")
}

// Team Lead chỉnh quyền team, KHÔNG vượt trần (matrix mặc định ∩ entitlement của team)
model TeamPermissionOverride {
  teamId        String @map("team_id")
  permissionKey String @map("permission_key")
  scope         String           // none | own | team
  @@id([teamId, permissionKey])
  @@map("team_permission_overrides")
}

model RolePermission {           // ma trận mặc định, Super Admin chỉnh
  roleKey       String @map("role_key")      // super_admin | team_lead | member | pending_member | independent
  permissionKey String @map("permission_key")
  scope         String                       // none | own | team | all
  premiumOnly   Boolean @default(false) @map("premium_only")
  @@id([roleKey, permissionKey])
  @@map("role_permissions")
}

model Entitlement {              // premium cá nhân hoặc team
  id          String   @id @default(cuid())
  subjectType String   @map("subject_type")  // user | team
  subjectId   String   @map("subject_id")
  plan        String                          // trial | week | month | custom
  features    Json                            // ["crm","leads","fb_inbox","agent.*","tool.exe"]
  startsAt    DateTime @map("starts_at")
  expiresAt   DateTime @map("expires_at")
  source      String                          // super_admin | license | platform_root
  grantedBy   String?  @map("granted_by")
  @@index([subjectType, subjectId])
  @@map("entitlements")
}
```
`User` thêm: `passwordHash`, `tokenVersion`, `referralCode` (unique), `status`. Team root: Entitlement ảo `source=platform_root` luôn active, không cần bản ghi.

**Quyền hiệu lực của user** = ma trận theo trạng thái (độc lập / pending / approved / lead / super admin) → áp `TeamPermissionOverride` (chỉ được thu hẹp, không mở rộng) → lọc tính năng premium theo `Entitlement` (của cá nhân ∪ của team nếu `approved` ∪ platform root). Member `pending` **không** thừa hưởng premium của team.

## 2. Giỏ hàng (Property): sở hữu, phân phối, môi giới/chính chủ
Code hiện có `owner_user_id`, `created_by_user_id`, `assigned_member_ids`. Đề xuất:
- `owner_user_id` = người tạo, **bất biến** (chỉ Super Admin đổi). Đây là gốc để chia hoa hồng sau này.
- `assigned_member_ids` (hoặc bảng `PropertyAssignment`) = người được phân phối bán. Team Lead phân phối cho member `approved`.
- Thêm `listing_source: 'broker' | 'owner'`, bắt buộc khi tạo mới, validate ở server.
- Lỗi cần vá ngay: `accessDefaults` cho phép body tự đặt `owner_user_id`. User thường có thể gán tin cho người khác hoặc chiếm quyền sở hữu. Server phải tự gán `owner_user_id = req.user.id`, bỏ qua giá trị client gửi.
- Scope đọc: `pending` → own; `approved` → own + được phân phối + team (read); `lead` → toàn team; `super_admin` → all.
- Chuẩn bị hoa hồng: lưu lịch sử phân phối (ai giao, cho ai, lúc nào) thay vì ghi đè mảng, để sau này tính chia hoa hồng được.

## 3. Ma trận mặc định
`A` tất cả · `T` team · `O` của mình · `—` không · `$` cần premium (cá nhân hoặc team) · `R` chỉ xem

| Quyền | Super Admin | Team Lead | Member approved | Member pending | Độc lập |
|---|---|---|---|---|---|
| Dashboard | A | T | O | — | O |
| Giỏ hàng: xem | A | T | O + được giao + T(R) | O | O |
| Giỏ hàng: tạo/sửa | A | T | O | O | O |
| Giỏ hàng: phân phối | A | T | — | — | — |
| Chatbot AI nội bộ | A | T | O | — | O |
| Shortlink | A | T | O | — | O |
| Hồ sơ cá nhân | O | O | O | O | O |
| Tải tool EXE (trial 3 ngày) | O | O | O | — | O |
| Duyệt / khoá member, chỉnh quyền team | A | T (trong trần) | — | — | — |
| Ma trận, Entitlement, License | A | — | — | — | — |
| Chat khách website + lịch sử | A | chỉ nếu là team root | chỉ nếu là team root | — | — |
| CRM, Leads đầu tư, Inbox FB | A | root: có; khác: $ | root: có; khác: $ | — | $ |
| Agent: Nguồn, Runtime, Báo cáo, Thông báo, Lead Intel | A | $ | $ | — | $ |
| User & Permission | A | T | — | — | — |
| Cấu hình hệ thống, Tích hợp | A | — | — | — | — |

Chưa chốt (đề xuất ẩn trừ Super Admin): SEO/Blog, Projects, AI Content, Automation Center.

## 4. Đăng ký và referral
`POST /api/auth/register {name,email,password,referralCode?}`
- Có mã hợp lệ → tạo user + `TeamMember(status=pending)`; mã không tồn tại → báo lỗi chung, không lộ mã nào có thật.
- Không mã → user độc lập, active ngay với quyền "Độc lập".
- Bắt buộc: email OTP, rate limit theo IP/email, captcha, mật khẩu hash (argon2id). Mã referral 10 ký tự ngẫu nhiên, Team Lead được đổi mã (mã cũ vô hiệu).
- Team root: `isPlatformRoot` chỉ gán cho team của Super Admin, ràng buộc bằng partial unique index `WHERE is_platform_root`.
- Team Lead duyệt: `PATCH /api/team/members/:userId {status}`; Team Lead chỉ thao tác trong team mình (kiểm tra `teamId` phía server, không tin id client gửi).

## 5. License / EXE (không đổi so với v1, bổ sung entitlement)
Khi tải exe lần đầu: tạo `Entitlement(plan=trial, features=["tool.exe"], 3 ngày, source=license)` cho user + `LicenseKey` gắn user. Nâng cấp tuần/tháng: Super Admin cấp Entitlement cá nhân hoặc team; key vẫn gắn user/thiết bị, tool kiểm tra entitlement hiệu lực khi activate và heartbeat. Member `pending` không tải được tool.

## 6. Lộ trình
- **P0**: bảo mật (v1), cộng thêm vá mass-assignment `owner_user_id`.
- **P1**: bảng Team/TeamMember/RolePermission/Entitlement, `requirePermission` + scope resolver, deny-by-default, vá module không có check, migrate `teamId`/`listing_source`.
- **P2**: đăng ký + referral + duyệt member, giỏ hàng phân phối, UI ma trận và entitlement cho Super Admin, UI Team Lead chỉnh quyền team, gỡ menu Agent thừa.
- **P3**: license + exe + auto-login FB/Zalo, thanh toán gói.
- **Sau**: chia hoa hồng team.

## 7. Cursor prompts (thay P1, P2, P3; P0 trong v1 giữ nguyên, thêm dòng cuối)

**P0 — thêm vào cuối prompt P0**
```
6) In accessDefaults and properties create/update routes, never trust owner_user_id/created_by_user_id from the request body: always set owner_user_id = req.authUser.id on create; only super_admin may change it afterwards.
```

**P1 — RBAC + Team + Entitlement**
```
Implement RBAC per RBAC-PLAN-v2.md. Prisma models: Team, TeamMember, TeamPermissionOverride, RolePermission, Entitlement (+ partial unique index so only one team has is_platform_root=true). Create server/modules/rbac: resolvePermissions(user) = role-matrix by state (super_admin | team_lead | member approved | member pending | independent) -> apply TeamPermissionOverride (may only narrow, never widen) -> filter premium features by Entitlement (user ∪ team if member approved ∪ implicit platform-root). requirePermission(key) middleware sets req.scope (own|team|all) and returns 402 {code:'PREMIUM_REQUIRED'} when a premium feature lacks entitlement. Make /api deny-by-default (route must declare permission or be in an explicit public allowlist). Update repositories to build where-clauses from scope. Patch modules lacking checks: planning, knowledge-base, decision-center, executive-dashboard, sales-layer, marketing-org, lead-acquisition, execution-trace, ai-gateway, facebookRoutes, investorLeadRoutes, blogRoutes admin, appointments. website_chat.* requires team.isPlatformRoot. Seed the default matrix. Tests: cross-team access denied, pending member sees only own properties, override cannot widen, no premium inheritance for pending members.
```

**P2 — Register, referral, giỏ hàng**
```
Add POST /api/auth/register {name,email,password,referralCode?}: valid code -> TeamMember(pending); no code -> independent user. Email OTP, rate limit, captcha, argon2id. Add team endpoints for the team lead: list members, approve/suspend, rotate referral code, edit TeamPermissionOverride (server enforces teamId from the authenticated lead, never from client). Properties: add listing_source ('broker'|'owner', required on create); owner_user_id immutable = creator; add PropertyAssignment history (assignedBy, assignedTo, at) for team-lead distribution, only to approved members. Build Super Admin UI for RolePermission matrix and Entitlement grant (user or team, plan, features, expiry). Make GET /api/auth/me return permissions[] + entitlements and drive the sidebar (src/app/navigation/sidebarConfig.ts) from it. Trim AGENT_SUBMENU to Nguồn (per user), Runtime, Báo cáo, Thông báo, Lead Intelligence.
```

**P3 — License + EXE** (như v1, thêm)
```
License activation must verify an active Entitlement containing "tool.exe" (user or team); pending members cannot download or activate. First download creates a 3-day trial Entitlement for the user.
```
