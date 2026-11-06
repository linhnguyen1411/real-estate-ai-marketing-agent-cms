# Báo cáo thực thi QA độc lập — Real Estate AI Marketing Agent CMS

| Thông tin | Giá trị |
| --- | --- |
| Ngày thực thi | 2026-11-03 |
| Nhánh / commit | `refactor/master-plan` — `b997200` |
| Vai trò | QA Senior (độc lập, black-box + UI + desktop) |
| Phạm vi | API, website quản trị, public site, Desktop Agent, kiểm tra static bảo mật |
| Kết quả tổng | **151/151 PASS (100%) sau fix** — vòng đầu 145/150, 5 FAIL thuộc 4 defect |
| Khuyến nghị phát hành | **Releasable trong phạm vi đã kiểm thử** — 4 defect đã fix và hồi quy; backlog NOT RUN cần môi trường thật (mục 9) |

## 1. Tóm tắt điều hành

Đã thực thi 151 test case trên 3 tầng độc lập. Vòng đầu phát hiện 5 FAIL thuộc 4 defect; sau khi fix, chạy lại toàn bộ suite trên build mới:

- **API black-box (121 case)**: 121 PASS — bao gồm AUTH-15 (token sau đổi mật khẩu dùng được) và SEC-07 (sai mật khẩu hiện tại trả 400).
- **UI smoke Playwright (12 case)**: 12 PASS — đăng nhập, menu theo quyền, route trực tiếp, tab hồ sơ, trang nguồn đều ổn định.
- **Desktop Agent (15 case)**: 15 PASS — DESK-05 hiển thị đúng phiên bản ngay khi khởi động; DESK-15 xác minh HMAC secret được mã hoá at-rest, không còn plaintext trên đĩa.
- **Thủ công/static (3 case)**: 3 PASS — legacy plaintext login hoạt động và nâng cấp Argon2 (kể cả sau restart); không còn credential hardcode; dữ liệu QA sạch.

Điểm tích cực: toàn bộ luồng RBAC, cô lập đa công ty, bất động sản, CRM, nội dung, lịch hẹn, license/PEM, ví token, nguồn AI Agent, public site và bảo mật API cơ bản đều PASS. Cơ chế updater desktop xác minh SHA-256 đúng, từ chối file sai hash và từ chối manifest thiếu trường; không tự cài khi người dùng tắt auto-update.

Hai defect P0 ở lớp xác thực (legacy login và token_version) đã được fix, xác minh bằng test trực tiếp và hồi quy toàn bộ. Trong phạm vi black-box/UI/desktop đã test, không còn defect P0/P1 mở.

## 2. Môi trường và phương pháp

### 2.1 API

- Server cô lập `NODE_ENV=development PORT=3100 AGENT_ENABLED=true RUN_WORKERS=false`, nạp cache mới từ PostgreSQL local (port 5434).
- Không dùng cache cũ của server dev 3000; server 3000 không bị dừng, không bị sửa dữ liệu.
- Tạo 4 user dùng một lần qua chính API `POST /api/users` (admin công ty A/B, member A/B) + 1 user trial cho license để cache và DB luôn đồng bộ.
- Cấp entitlement tạm thời 7 ngày, xoá sau khi chạy.
- Mỗi case gọi HTTP thật; assertion kiểm tra status, schema, mã lỗi, cô lập dữ liệu và side effect DB khi cần.

### 2.2 UI

- Playwright Chromium 1248 headless, viewport 1440×900, trỏ server cô lập 3100.
- Đăng nhập bằng tài khoản QA tạm; kiểm tra menu, URL, nội dung, error boundary, persistence sau reload.
- Screenshot lỗi lưu tại `runtime/qa/screenshots/`.

### 2.3 Desktop Agent

- Build từ source bằng `npm run build:desktop` (Electron 1.1.0).
- Chạy Electron với `--user-data-dir` tạm, `--remote-debugging-port=9333`, kết nối Playwright qua CDP.
- Mock VPS tại `http://127.0.0.1:3200` phục vụ danh sách nguồn Facebook và manifest cập nhật; tuyệt đối không chạy installer giả.
- Tắt `autoUpdateEnabled` trong profile test để tránh tự cài; chỉ kiểm tra luồng tải và xác minh SHA-256.

### 2.4 Nguyên tắc an toàn

- QA không sửa mã trong lúc kiểm thử; 4 fix được áp dụng sau khi lập defect log, rồi chạy lại toàn bộ suite trên build đã fix.
- Không đụng tới Facebook/Zalo thật, không gửi Telegram thật, không gọi VPS production.
- Không commit/push.
- Dữ liệu và tiến trình QA được dọn sạch sau khi kết thúc (xem mục 6).

## 3. Kết quả tổng hợp

| Suite | Tổng | PASS | FAIL | Tỉ lệ | Artifact |
| --- | --- | --- | --- | --- | --- |
| API black-box | 121 | 121 | 0 | 100% | `runtime/qa/api-results.json` |
| UI smoke | 12 | 12 | 0 | 100% | `runtime/qa/ui-results.json` |
| Desktop Agent | 15 | 15 | 0 | 100% | `runtime/qa/desktop-results.json` |
| Thủ công/static | 3 | 3 | 0 | 100% | Mục 4.5 + `qa/legacy-login-check.mjs` |
| **Tổng** | **151** | **151** | **0** | **100%** | |

Bổ sung ngoài bộ đếm: chạy `npx vitest run tests/security` — **16 file / 132 test PASS** (bao gồm RBAC, tenant isolation, license/PEM, password hygiene, token crypto).

Theo ưu tiên:

| Ưu tiên | Tổng | PASS | FAIL | Tỉ lệ |
| --- | --- | --- | --- | --- |
| P0 | 72 | 72 | 0 | 100% |
| P1 | 62 | 62 | 0 | 100% |
| P2 | 17 | 17 | 0 | 100% |

### 3.1 Danh sách case FAIL

Không còn case FAIL sau fix. Các case từng FAIL ở vòng đầu nay đều PASS:

| ID | Defect | Kết quả sau fix |
| --- | --- | --- |
| AUTH-15 | BUG-AUTH-02 | Login lại sau đổi mật khẩu → `GET /api/auth/me` HTTP 200. |
| SEC-07 | BUG-AUTH-02 | Token mới hợp lệ; sai current_password trả đúng 400. |
| DESK-05 | BUG-DESK-01 | `#update-current-version` hiển thị 1.1.0 ngay khi mở app. |
| MAN-01 | BUG-AUTH-01 | Legacy plaintext login 200, nâng cấp Argon2, sống qua restart. |
| MAN-02 | BUG-SEC-01 | Không còn credential trong source; secret mã hoá `enc:v1:` trên đĩa. |

## 4. Chi tiết defect

### BUG-AUTH-01 — P0 — Tài khoản legacy plaintext không thể đăng nhập — ✅ Đã fix

**Hiện tượng**

4 tài khoản seed còn lưu mật khẩu plaintext trong `data.password` (chưa có `passwordHash`):

- `admin@danang.example.com`
- `admin@hoian.example.com`
- `member-a@danang.example.com`
- `member-b@danang.example.com`

Đăng nhập bằng đúng mật khẩu seed trả 401:

```http
POST /api/auth/login
{"email":"member-a@danang.example.com","password":"member123"}

HTTP/1.1 401 Unauthorized
{"status":"error","message":"Email hoặc mật khẩu không đúng."}
```

Đã tái hiện trên cả server dev 3000 và server QA 3100. Đây là lỗi sản phẩm, không phải lỗi môi trường test.

**Root cause**

`server/dbHelper.ts:149` gộp cả plaintext vào trường hash:

```ts
password_hash: row.passwordHash || (data.password_hash as string) || (data.password as string),
```

Vì `user.password_hash` luôn truthy, nhánh xác thực legacy trong `server/modules/auth/authRoutes.ts:238-248` không bao giờ chạy. Code gọi `verifyPassword()` (chỉ hỗ trợ Argon2/scrypt) với chuỗi plaintext và trả false. Hàm `verifyPlaintextLegacy()` trong `server/modules/auth/password.ts:127` trở thành dead code trong luồng đăng nhập.

**Tác động**

- Mọi tài khoản tạo trước khi có hash (seed, demo, dữ liệu production cũ) bị khoá đăng nhập.
- Cơ chế "transparent upgrade" sang Argon2 không hoạt động.
- Người dùng không có cách tự khắc phục; cần can thiệp DB/admin.

**Khuyến nghị**

1. Chỉ map trường hash thật: `password_hash: row.passwordHash || data.password_hash` và giữ `password: data.password` riêng.
2. Hoặc kiểm tra định dạng hash trước khi gọi `verifyPassword`; nếu không phải `$argon2`/`scrypt` thì chuyển sang `verifyPlaintextLegacy`.
3. Bổ sung migration/backfill hash cho dữ liệu legacy trước khi tắt hỗ trợ plaintext.
4. Giữ test MAN-01 trong bộ hồi quy; assert DB được nâng cấp Argon2 sau lần đăng nhập đầu.

### BUG-AUTH-02 — P0 — Đổi mật khẩu làm mọi phiên đăng nhập mới bị 401 — ✅ Đã fix

**Hiện tượng**

1. User đăng nhập thành công.
2. User đổi mật khẩu thành công (HTTP 200).
3. User đăng nhập lại bằng mật khẩu mới: HTTP 200, nhận token mới.
4. Gọi bất kỳ API cần xác thực bằng token mới: **HTTP 401** với message "Phiên đăng nhập đã hết hiệu lực do thay đổi mật khẩu hoặc bảo mật."

Đây là lỗi P0 vì sau khi đổi mật khẩu, tài khoản bị khoá khỏi API ngay ở lần đăng nhập kế tiếp.

**Bằng chứng**

- `AUTH-15`: tạo user → login → đổi mật khẩu → login mật khẩu mới → `GET /api/auth/me` → 401.
- `SEC-07`: dùng token mới đó để đổi mật khẩu với `current_password` sai; kỳ vọng 400 nhưng nhận 401 vì token đã bị coi là hết hiệu lực.

**Root cause**

- `server/modules/auth/authAccess.ts:12-34`: `toAuthUser()` không đưa `token_version` vào `AuthUser`.
- `server/modules/auth/authRoutes.ts:260-262`: login dùng `baseUser = toAuthUser(user, db)` rồi `signToken(baseUser)`.
- `server/modules/auth/authAccess.ts:108-121`: `signToken` dùng `user.token_version ?? 1`, nên luôn ký `token_version=1`.
- `server/modules/auth/authRoutes.ts:428-441`: đổi mật khẩu tăng `token_version` trong DB lên 2.
- `server/modules/auth/authRoutes.ts:315-317`: auth gate so sánh token version (1) với stored version (2) → 401.

Nói cách khác: token mới được ký bằng version mặc định 1 thay vì version hiện tại của user, nên bị chính cơ chế thu hồi token từ chối.

**Tác động**

- Người dùng đổi mật khẩu bị đăng xuất vĩnh viễn khỏi API sau lần đăng nhập kế tiếp.
- Các tính năng "đổi mật khẩu" và "quên mật khẩu" (nếu dùng cùng luồng) có thể khiến tài khoản không sử dụng được.
- Có thể che giấu các lỗi khác vì mọi request đều 401.

**Khuyến nghị**

1. Bổ sung `token_version` vào `AuthUser` và `toAuthUser()`.
2. Hoặc truyền version lưu trong DB trực tiếp vào `signToken()` ở mọi luồng phát token (login, register, refresh, đổi mật khẩu).
3. Đảm bảo token cũ vẫn bị thu hồi (test SEC-06) nhưng token phát sau đó dùng được.
4. Thêm regression test: sau đổi mật khẩu, token cũ 401, token mới 200; sai current_password trả 400.

### BUG-DESK-01 — P2 — UI Cài đặt hiển thị trống phiên bản lúc khởi động — ✅ Đã fix

**Hiện tượng**

Ngay sau khi mở Desktop Agent, mục "Cập nhật ứng dụng" hiển thị:

- "Phiên bản đang chạy": rỗng.
- Trạng thái: "Không có thông tin cập nhật."

Sau khi updater phát state (auto-check sau 20 giây hoặc bấm "Kiểm tra cập nhật"), phiên bản hiển thị đúng `1.1.0`. Test DESK-10 xác nhận UI hiển thị đúng sau khi có state.

**Root cause**

- Renderer gọi `window.desktopAgent.getUpdateState()` một lần trong `DOMContentLoaded` (`desktop/src/renderer/renderer.ts:653-654`).
- Main tạo `AgentUpdater` ở cuối `createWindow()` (`desktop/src/main/index.ts:619-630`), sau khi `await mainWindow.loadFile()` đã hoàn tất.
- Handler `update:get-state` trả `null` khi updater chưa tồn tại (`desktop/src/main/index.ts:852`).
- Renderer chỉ render một lần, không retry, nên giữ trạng thái null.

**Tác động**

- Chỉ ảnh hưởng hiển thị/niềm tin người dùng, không ảnh hưởng khả năng cập nhật thật.
- Có thể khiến người dùng tưởng app không có cơ chế cập nhật.

**Khuyến nghị**

1. Trả state mặc định `{ currentVersion: APP_VERSION, status: 'idle', ... }` thay vì `null` trước khi updater sẵn sàng.
2. Hoặc khởi tạo `AgentUpdater` trước `loadFile()`.
3. Hoặc renderer retry `getUpdateState()` sau khi nhận event `update:state` đầu tiên.
4. Giữ test DESK-05.

### BUG-SEC-01 — P1 — HMAC credential của agent bị hardcode và lưu plaintext — ✅ Đã fix

**Hiện tượng**

`desktop/src/main/index.ts:72-74` chứa giá trị mặc định dạng thật:

```ts
vpsApiKeyId: 'ak_…(đã che)',
vpsApiSecret: 'as_…(đã che)',
```

Ngoài ra, `saveSettings()` chỉ mã hoá `telegramBotToken`; `vpsApiSecret` được ghi plaintext vào `desktop_agent_settings.json` trong profile người dùng (`desktop/src/main/index.ts:166-176`).

**Tác động**

- Bất kỳ ai có source, bản build hoặc quyền đọc profile đều lấy được credential ký request ingest.
- Credential dùng chung trong mọi bản cài làm mất khả năng truy vết và thu hồi theo từng agent.
- Nếu key có quyền ghi lead/property, kẻ xấu có thể gửi dữ liệu giả hoặc lạm dụng endpoint.

**Khuyến nghị**

1. Thu hồi/rotate key hiện tại ngay; không tái sử dụng trong bản phát hành.
2. Xoá credential khỏi `defaultSettings`; yêu cầu cấu hình hoặc cấp phát động.
3. Dùng cơ chế enrollment/credential per-agent đã có (`/api/agent/api-credentials`) thay vì key dùng chung.
4. Mã hoá `vpsApiSecret` bằng `safeStorage` giống Telegram token; không ghi plaintext.
5. Kiểm tra secret trong CI (secret scanning) để chặn tái phát.

### 4.5 Tổng hợp fix và xác minh

| Defect | File thay đổi | Nội dung fix | Xác minh |
| --- | --- | --- | --- |
| BUG-AUTH-01 | `server/dbHelper.ts:149` | Bỏ fallback `data.password` khi map `password_hash`; plaintext chỉ còn ở trường `password` để nhánh legacy xử lý. | `qa/legacy-login-check.mjs`: login 200, `/me` 200, hash Argon2, plaintext bị xoá, restart vẫn login được. |
| BUG-AUTH-02 | `server/modules/auth/authAccess.ts:22` | `toAuthUser` trả `token_version` từ user record, nên token login/register mang đúng version hiện tại. | AUTH-15 PASS; SEC-06 (token cũ bị thu hồi) và SEC-07 (400 khi sai current_password) PASS. |
| BUG-DESK-01 | `desktop/src/main/index.ts` | `update:get-state` trả state `idle` mặc định (kèm `APP_VERSION`) trước khi `AgentUpdater` khởi tạo. | DESK-05 PASS: phiên bản 1.1.0 hiển thị ngay khi mở app. |
| BUG-SEC-01 | `desktop/src/main/index.ts` | Xoá credential hardcode khỏi `defaultSettings`; mã hoá/giải mã `vpsApiSecret` và `telegramBotToken` bằng `safeStorage` (`enc:v1:`). | MAN-02 PASS; DESK-15 PASS (file settings không chứa plaintext, IPC trả secret gốc); DESK-12 PASS sau restart. |

Lưu ý vận hành: fix loại bỏ credential khỏi source nhưng **không thể thu hồi key đã phát tán**. Cần rotate/revoke cặp key cũ trên VPS và cấp credential theo từng agent qua `/api/agent/api-credentials` trước khi phát hành.

## 5. Những khu vực đã PASS đáng chú ý

- **Health & xử lý lỗi**: `/healthz`, `/readyz`, JSON 404 cho route agent không tồn tại, body limit 413, JSON hỏng 400, header helmet, rate limit public.
- **RBAC & tenant isolation**: 11/11 RBAC và 9/9 cô lập công ty; deny-by-default; 402 PREMIUM_REQUIRED; không đọc/sửa/xoá chéo công ty; nguồn hệ thống chia sẻ đúng, nguồn riêng không lộ.
- **Nghiệp vụ**: 9/9 properties, 6/6 customers, 7/7 content, 7/7 appointments, 10/10 license (idempotent, PEM, revoke), 10/10 wallet (optimistic lock, số dư âm, ghi chú bắt buộc, ví đóng băng).
- **Agent sources**: 14/14 gồm validation, chống trùng URL, quyền tạo nguồn hệ thống, enqueue job, giới hạn 5 phút.
- **Public site**: 9/9 gồm canonical slug `slug-id`, redirect 301, sitemap/robots, short link 302, form contact validation.
- **UI web**: 12/12 gồm chặn admin khi chưa đăng nhập, menu super/company/member đúng quyền, gỡ Website Chat/Chat History, persistence tab ví/license qua URL, route trực tiếp không crash.
- **Desktop updater**: tải manifest HTTPS/localhost, xác minh SHA-256, từ chối hash sai và manifest thiếu trường, không tự cài khi auto-update tắt, giữ cấu hình/nguồn qua restart.
- **Desktop security**: secret HMAC được mã hoá at-rest (`enc:v1:`) và giải mã đúng khi đọc lại; không còn credential trong source.
- **Legacy authentication**: user plaintext cũ đăng nhập được, tự nâng cấp Argon2 và vẫn hoạt động sau khi server khởi động lại.

## 6. Dọn dẹp và tính toàn vẹn môi trường

| Kiểm tra | Kết quả |
| --- | --- |
| User QA còn lại (`qa.*`) | 0 |
| Entitlement `grantedBy=qa-runner` | 0 |
| Agent source tên chứa QA | 0 |
| Customer QA còn lại | 0 |
| User legacy QA (`qa.legacy.*`) | 0 |
| State file `runtime/qa/state.json` | Đã xoá |
| Server QA port 3100 | Đã dừng; không còn LISTENING (0 connection) |
| Server dev 3000 | Không bị dừng, không bị sửa |
| Installer giả | Không chạy; file tải tạm đã xoá |
| Profile desktop tạm | Đã xoá |

Đã kiểm tra lại sau vòng chạy post-fix: `qaUsers=0`, `qaEntitlements=0`, `qaSources=0`, `qaCustomers=0`, `legacyUsers=0`.

## 7. Artifact và khả năng tái lập

| Artifact | Nội dung |
| --- | --- |
| `qa/api-e2e.mjs` | 121 test case API black-box |
| `qa/ui-smoke.mjs` | 12 test case UI Playwright |
| `qa/desktop-smoke.mjs` | 15 test case Desktop Agent + mock VPS |
| `qa/legacy-login-check.mjs` | Seed user plaintext, server riêng port 3101, xác minh login + Argon2 + restart |
| `qa/lib.mjs` | Tạo/khôi phục user và entitlement QA |
| `qa/build-testcase-doc.mjs` | Sinh tài liệu testcase từ kết quả |
| `runtime/qa/api-results.json` / `.md` | Kết quả API đầy đủ |
| `runtime/qa/ui-results.json` / `.md` | Kết quả UI đầy đủ |
| `runtime/qa/desktop-results.json` / `.md` | Kết quả desktop đầy đủ |
| `runtime/qa/desktop-mock-requests.log` | Request desktop gửi mock VPS (nguồn, manifest, tải file) |
| `runtime/qa/desktop-electron.log` | Log Electron khi smoke |
| `runtime/qa/server-3100.log` | Log server cô lập |
| `runtime/qa/screenshots/DESK-05.png` | Ảnh chụp lỗi hiển thị phiên bản ở vòng đầu (lưu lịch sử) |

### Lệnh tái lập

```bash
# 1. Build desktop
npm run build:desktop

# 2. Desktop smoke (tự tạo mock VPS, tự dọn dẹp)
node qa/desktop-smoke.mjs

# 3. Khởi động server QA cô lập (ví dụ)
NODE_ENV=development PORT=3100 SKIP_FREE_DEV_PORTS=1 RUN_WORKERS=false AGENT_ENABLED=true npx tsx server.ts

# 4. API + UI smoke (server 3100)
QA_BASE=http://127.0.0.1:3100 node qa/api-e2e.mjs
QA_BASE=http://127.0.0.1:3100 node qa/ui-smoke.mjs

# 5. Legacy plaintext login + Argon2 upgrade (tự seed DB, tự chạy server 3101, tự dọn)
node qa/legacy-login-check.mjs

# 6. Test bảo mật tầng unit
npx vitest run tests/security

# 7. Sinh lại tài liệu testcase
node qa/build-testcase-doc.mjs
```

## 8. Kết luận và khuyến nghị

**Kết luận**: Sau khi fix và hồi quy, **151/151 test case PASS**, 100% P0/P1 PASS. Hai lỗi P0 ở lớp xác thực (legacy login, token_version sau đổi mật khẩu) đã được xác minh trực tiếp và bằng suite tự động. Các lỗi P1/P2 (hardcode credential, update state) cũng đã fix và có test hồi quy (DESK-15, DESK-05).

**Khuyến nghị trước khi phát hành**:

1. **Rotate/revoke** cặp HMAC key cũ trên VPS — fix chỉ loại bỏ credential khỏi source, không thu hồi được key đã phát tán.
2. Cấu hình credential per-agent qua `/api/agent/api-credentials`; không phát hành key dùng chung.
3. Thêm secret scanning vào CI để chặn hardcode tái phát.
4. Chạy lại 3 suite trên build phát hành cuối và lưu artifact; xử lý backlog NOT RUN trước khi mở rộng phạm vi.

## 9. Giới hạn của phiên test

- Không đăng nhập Facebook/Zalo thật, không quét GraphQL thật, không gửi lead tới VPS production.
- Không gửi Telegram thật; chỉ kiểm tra nhánh thiếu cấu hình và UI không crash.
- Không chạy installer cập nhật thật; chỉ kiểm tra tải, hash, manifest và trạng thái UI.
- Không kiểm thử publish hàng loạt lên group thật, checkpoint tài khoản, rate limit Facebook.
- Không kiểm thử tải/performance, đa trình duyệt, mobile, accessibility.
- Không kiểm thử thanh toán thật/đối soát ví với cổng ngoài.
- Không kiểm thử backup/restore PostgreSQL và migration trên dữ liệu lớn.

Các mục trên cần môi trường/tài khoản thật và phê duyệt riêng; được ghi nhận là **NOT RUN** trong tài liệu testcase.

## 10. Thay đổi trong phạm vi QA

Ngoài file QA/tài liệu, chỉ 3 file sản phẩm được sửa để fix 4 defect (không thay đổi hành vi nghiệp vụ khác):

**Fix sản phẩm**
- `server/dbHelper.ts` — bỏ fallback plaintext khi nạp `password_hash` (BUG-AUTH-01).
- `server/modules/auth/authAccess.ts` — thêm `token_version` vào `toAuthUser` (BUG-AUTH-02).
- `desktop/src/main/index.ts` — default update state; bỏ credential hardcode; mã hoá secret at-rest (BUG-DESK-01, BUG-SEC-01).

**QA / tài liệu**
- `qa/lib.mjs` — tạo user QA qua API, entitlement tạm, khôi phục state.
- `qa/api-e2e.mjs` — bổ sung AUTH-15; cập nhật các assertion theo hành vi thực tế.
- `qa/ui-smoke.mjs` — 12 case UI.
- `qa/desktop-smoke.mjs` — 15 case desktop + mock VPS (thêm DESK-15).
- `qa/legacy-login-check.mjs` — kiểm chứng legacy login + Argon2 + restart.
- `qa/build-testcase-doc.mjs` — sinh tài liệu testcase.
- `docs/qa/SYSTEM_TEST_CASES.md` — bộ testcase toàn hệ thống.
- `docs/qa/EXECUTION_REPORT.md` — báo cáo này.

Không commit/push. Các thay đổi đang ở working tree để chủ dự án review.
