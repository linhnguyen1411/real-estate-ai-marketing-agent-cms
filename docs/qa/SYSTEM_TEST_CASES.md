# Bộ testcase toàn hệ thống — Real Estate AI Marketing Agent CMS

| Thông tin | Giá trị |
| --- | --- |
| Phiên bản tài liệu | 1.1 (sau fix & chạy lại) |
| Ngày lập / thực thi | 2026-11-03 |
| Nhánh | `refactor/master-plan` — commit `b997200` |
| Vai trò | QA Senior (kiểm thử độc lập, black-box + UI + desktop) |
| Môi trường API | Server cô lập port 3100, PostgreSQL local 5434, cache nạp mới |
| Môi trường UI | Playwright Chromium (headless) trỏ port 3100 |
| Môi trường Desktop | Electron 1.1.0 build từ `desktop/`, mock VPS `127.0.0.1:3200`, profile tạm |
| Tổng test case | 151 |
| Kết quả | **151 PASS / 0 FAIL** |

## 1. Mục tiêu và phạm vi

Mục tiêu: xác minh độc lập các luồng nghiệp vụ chính của CMS bất động sản sau đợt refactor, bao gồm:

- Nền tảng HTTP: health, xử lý lỗi, giới hạn body, header bảo mật, rate limit.
- Xác thực và phân quyền: đăng nhập/đăng ký, token, đổi mật khẩu, RBAC, cô lập dữ liệu theo công ty.
- Nghiệp vụ: bất động sản, khách hàng CRM, nội dung, lịch hẹn, license/PEM, ví token, nguồn AI Agent.
- Website công khai: SEO, canonical slug, sitemap/robots, short link, form liên hệ.
- Giao diện quản trị: đăng nhập, menu theo quyền, route trực tiếp, tab hồ sơ, trang nguồn.
- Desktop Agent: build, cửa sổ điều khiển, tải nguồn, luân chuyển nguồn, lưu cấu hình, Telegram, auto-update.

Ngoài phạm vi phiên này (xem mục 9): đăng nhập Facebook/Zalo thật, gửi Telegram thật, chạy installer cập nhật, kiểm thử tải/performance, kiểm thử đa trình duyệt/thiết bị.

## 2. Môi trường và dữ liệu test

- **Server API cô lập**: `NODE_ENV=development PORT=3100 AGENT_ENABLED=true RUN_WORKERS=false`, cache nạp mới từ PostgreSQL để tránh cache cũ của server dev 3000.
- **Tài khoản test**: 4 user dùng một lần (`qa.admin-a.*`, `qa.admin-b.*`, `qa.member-a.*`, `qa.member-b.*`) tạo qua chính API `POST /api/users` để cache và DB đồng bộ; 1 user trial cho license.
- **Entitlement tạm**: cấp feature `tool.exe`, `agent.*`, `crm`, `investor_leads`, `fb_inbox`, `automation.*`, `team.manage`, `lead.intel`, hết hạn sau 7 ngày và bị xoá khi kết thúc.
- **UI**: Playwright Chromium 1248 headless; screenshot lỗi lưu tại `runtime/qa/screenshots/`.
- **Desktop**: Electron local với `--user-data-dir` tạm, mock VPS chỉ phục vụ `/api/agent-ingest/v1/sources` và `/downloads/agent-version.json`; tắt auto-update để không chạy installer giả.
- **Không thay đổi server dev 3000**. QA không sửa mã trong lúc kiểm thử; 4 defect được fix sau khi lập defect log và toàn bộ suite được chạy lại trên build đã fix.

## 3. Chiến lược và quy ước

| Mức | Ý nghĩa |
| --- | --- |
| P0 | Luồng sống còn: đăng nhập, phân quyền, cô lập dữ liệu, thanh toán/ví, license, public site. |
| P1 | Luồng quan trọng: CRUD nghiệp vụ, cấu hình, nguồn agent, cập nhật desktop. |
| P2 | Kiểm tra biên, thông báo lỗi, tiện ích, khả năng chịu lỗi. |

| Trạng thái | Ý nghĩa |
| --- | --- |
| PASS | Đúng kỳ vọng, có bằng chứng runtime. |
| FAIL | Sai kỳ vọng hoặc phát hiện lỗi sản phẩm; có ID defect tương ứng. |
| NOT RUN | Chưa thực thi trong phiên, nằm trong backlog mục 9. |

## 4. Tổng hợp kết quả

| Suite | Tổng | PASS | FAIL | Tỉ lệ PASS | File kết quả |
| --- | --- | --- | --- | --- | --- |
| API black-box | 121 | 121 | 0 | 100.0% | `runtime/qa/api-results.json` |
| UI smoke (Playwright) | 12 | 12 | 0 | 100.0% | `runtime/qa/ui-results.json` |
| Desktop Agent | 15 | 15 | 0 | 100.0% | `runtime/qa/desktop-results.json` |
| Thủ công / static | 3 | 3 | 0 | 100.0% | Mục 6.4 |
| **Tổng** | **151** | **151** | **0** | **100.0%** | |

Phân bổ ưu tiên: P0=72, P1=62, P2=17.

Danh sách FAIL: **không còn** — 4 defect phát hiện ở vòng đầu đã được fix và xác minh lại (xem mục 7).

Vòng chạy lại sau fix: API 121/121, UI 12/12, Desktop 15/15, thủ công 3/3 PASS.

## 5. Ma trận module

| Module | Số case | PASS | FAIL | Ghi chú |
| --- | --- | --- | --- | --- |
| Sức khoẻ hệ thống (`Health`) | 6 | 6 | 0 | API black-box |
| Xác thực (`Authentication`) | 15 | 15 | 0 | API black-box |
| Phân quyền (RBAC) (`RBAC`) | 11 | 11 | 0 | API black-box |
| Cô lập đa công ty (`Tenant isolation`) | 9 | 9 | 0 | API black-box |
| Bất động sản (`Properties`) | 9 | 9 | 0 | API black-box |
| CRM khách hàng (`Customers`) | 6 | 6 | 0 | API black-box |
| Nội dung / bài viết (`Content`) | 7 | 7 | 0 | API black-box |
| Lịch hẹn xem nhà (`Appointments`) | 7 | 7 | 0 | API black-box |
| License & PEM (`License`) | 10 | 10 | 0 | API black-box |
| Ví token (`Wallet`) | 10 | 10 | 0 | API black-box |
| Nguồn AI Agent (`Agent sources`) | 14 | 14 | 0 | API black-box |
| Website công khai (`Public site`) | 9 | 9 | 0 | API black-box |
| Bảo mật API (`Security`) | 8 | 8 | 0 | API black-box |
| Giao diện web (UI smoke) | 12 | 12 | 0 | Playwright |
| Desktop Agent | 15 | 15 | 0 | Electron + mock VPS |
| Thủ công / static | 3 | 3 | 0 | Legacy auth (đã fix), secret at-rest, dọn dẹp |

## 6. Test case chi tiết

### 6.1 API black-box (121 case)

Nguồn: `qa/api-e2e.mjs`. Mỗi case gọi HTTP thật tới server cô lập, không mock tầng nghiệp vụ.

#### Sức khoẻ hệ thống — `Health` (6/6 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| HLT-01 | P0 | Liveness endpoint không cần xác thực | GET /healthz | HTTP 200, status=ok | PASS | HTTP 200, uptime=14s |
| HLT-02 | P0 | Readiness kiểm tra kết nối PostgreSQL | GET /readyz | HTTP 200, database=connected | PASS | HTTP 200, database connected |
| HLT-03 | P1 | Health ẩn chi tiết scheduler khi chưa đăng nhập | GET /api/health (không token) | HTTP 200, scheduler chỉ có enabled/running | PASS | Không lộ lastTickAt/lastError |
| HLT-04 | P1 | Health trả chi tiết scheduler khi có token | GET /api/health + Bearer super admin | HTTP 200, có tickIntervalMs | PASS | tickIntervalMs=60000 |
| HLT-05 | P1 | Route /api/agent không tồn tại trả JSON 404, không trả HTML | GET /api/agent/route-khong-ton-tai | HTTP 404 + JSON status=error | PASS | HTTP 404 JSON: Agent API route không tồn tại. Restart server nếu vừa thêm e… |
| HLT-06 | P0 | Manifest cập nhật desktop hợp lệ và không cache | GET /downloads/agent-version.json | HTTP 200, version/sha256/size đầy đủ, Cache-Control no-store | PASS | version=1.1.0, size=175519232 |

#### Xác thực — `Authentication` (15/15 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | P0 | Đăng nhập Super Admin thành công | POST /api/auth/login admin@example.com | HTTP 200 + token + user không chứa hash | PASS | role=owner |
| AUTH-02 | P0 | Đăng nhập quản trị công ty A thành công | POST /api/auth/login admin@danang.example.com | HTTP 200, company_id=comp-da-nang | PASS | role=company, company=comp-da-nang |
| AUTH-03 | P0 | Sai mật khẩu bị từ chối, thông điệp không lộ tài khoản | POST /api/auth/login với mật khẩu sai | HTTP 401 + thông điệp chung | PASS | message="Email hoặc mật khẩu không đúng." |
| AUTH-04 | P1 | Email không tồn tại trả cùng thông điệp với sai mật khẩu | POST /api/auth/login email ngẫu nhiên | HTTP 401, cùng message AUTH-03 | PASS | Hai trường hợp trả cùng thông điệp |
| AUTH-05 | P1 | Thiếu mật khẩu trả lỗi validation 400 | POST /api/auth/login {email} | HTTP 400 + issues | PASS | issues=password |
| AUTH-06 | P0 | API bảo vệ từ chối request không có token | GET /api/customers không Authorization | HTTP 401 | PASS | HTTP 401 |
| AUTH-07 | P0 | Token bị sửa bị từ chối | GET /api/auth/me với token sửa 1 ký tự | HTTP 401 | PASS | HTTP 401 |
| AUTH-08 | P0 | /api/auth/me trả hồ sơ + quyền hiệu lực | GET /api/auth/me (super admin) | HTTP 200, có role, permissions, roleKey, không có hash | PASS | roleKey=super_admin, permissions=31 |
| AUTH-09 | P1 | Cập nhật tên hồ sơ và đọc lại đúng | PUT /api/auth/profile {name} | HTTP 200, /me phản ánh tên mới | PASS | name="QA Admin A" → "QA Admin A QA" → khôi phục |
| AUTH-10 | P0 | Không thể nâng quyền qua API hồ sơ (mass assignment) | PUT /api/auth/profile {role:"owner"} | HTTP 200 nhưng role không đổi | PASS | role vẫn là company |
| AUTH-11 | P1 | Đăng ký mật khẩu yếu bị từ chối | POST /api/auth/register password ngắn | HTTP 400 theo chính sách mật khẩu | PASS | Mật khẩu phải có ít nhất 10 ký tự. |
| AUTH-12 | P1 | Đăng ký email trùng bị từ chối | POST /api/auth/register email đã tồn tại | HTTP 400 | PASS | Email đã được sử dụng. |
| AUTH-13 | P1 | Đăng ký tài khoản mới và đăng nhập lại | POST register → login | HTTP 200 cả hai, role=member | PASS | userId=usr-1793712240615-kgtl |
| AUTH-14 | P2 | Đăng nhập công ty B và member A/B thành công | POST login 3 tài khoản | HTTP 200, đúng company | PASS | adminB=comp-hoi-an, memberA=comp-da-nang, memberB=comp-da-nang |
| AUTH-15 | P0 | Token của lần đăng nhập mới sau đổi mật khẩu phải dùng được | Tạo user → login → đổi mật khẩu → login lại → GET /me | GET /me HTTP 200 | PASS | userId=u-1793712241334 |

#### Phân quyền (RBAC) — `RBAC` (11/11 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| RBAC-01 | P0 | Member không được xem danh sách người dùng | GET /api/users (member A) | HTTP 403 | PASS | code=FORBIDDEN |
| RBAC-02 | P0 | Member không được quản lý license | GET /api/admin/licenses (member A) | HTTP 403 | PASS | HTTP 403 |
| RBAC-03 | P0 | Quản trị công ty chỉ thấy user cùng công ty | GET /api/users (admin A) | HTTP 200, toàn bộ company_id=comp-da-nang | PASS | 8 user, không lẫn công ty khác |
| RBAC-04 | P0 | Quản trị công ty không được đổi cài đặt hệ thống | GET /api/settings (admin A) | HTTP 403 | PASS | HTTP 403 |
| RBAC-05 | P1 | Super Admin đọc được cài đặt hệ thống | GET /api/settings (super) | HTTP 200 | PASS | HTTP 200 |
| RBAC-06 | P0 | Ma trận RBAC chỉ Super Admin xem được | GET /api/rbac/matrix (super vs member) | super 200, member 403 | PASS | super=200, member=403 |
| RBAC-07 | P1 | Badge điều hướng theo phạm vi công ty | GET /api/navigation-counts (admin A) | HTTP 200 | PASS | keys=crm,properties,posts,pendingInbox,leadIntelligence,investorLeads,externalInventory,notifications,jobs,sources,websiteChat,chatHistory |
| RBAC-08 | P0 | Tính năng premium chặn user không có quyền lợi | GET /api/customers (user mới, không entitlement) | HTTP 402 PREMIUM_REQUIRED | PASS | HTTP 402 PREMIUM_REQUIRED |
| RBAC-09 | P1 | Trang executive chỉ dành cho platform admin | GET /api/executive/snapshot (member A) | HTTP 403 | PASS | HTTP 403 |
| RBAC-10 | P1 | Entitlement mở khoá module agent cho công ty | GET /api/agent/sources (admin A) | HTTP 200 | PASS | sources=20 |
| RBAC-11 | P2 | Route chưa khai báo bị chặn mặc định (deny-by-default) | GET /api/khong-khai-bao (super) | HTTP 403/404 JSON | PASS | HTTP 403 |

#### Cô lập đa công ty — `Tenant isolation` (9/9 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| TEN-01 | P0 | Khách hàng công ty A không lộ sang công ty B | Tạo customer A → list A/B/super | A thấy, B không thấy, super thấy | PASS | id=c-1793712241992 |
| TEN-02 | P0 | Công ty B không sửa/xoá được khách hàng công ty A | PUT + DELETE /api/customers/:id (admin B) | HTTP 403 cả hai | PASS | PUT=403, DELETE=403 |
| TEN-03 | P0 | Bất động sản công ty B không đọc được bởi công ty A | Tạo property B → GET bằng admin A | HTTP 403 | PASS | id=p-1793712242008, đọc chéo=403 |
| TEN-04 | P0 | Công ty A không sửa được bất động sản công ty B | PUT /api/properties/:id (admin A) | HTTP 403 | PASS | HTTP 403 |
| TEN-05 | P0 | Nguồn hệ thống do Super Admin tạo hiển thị cho mọi công ty | Super tạo source scope=system → list admin A/B | A và B đều thấy, companyId=null | PASS | id=cmw0pyfs30000k67odno5u637 chia sẻ cho A và B |
| TEN-06 | P0 | Nguồn riêng của công ty A không lộ sang công ty B | Admin A tạo source → list admin B | B không thấy, super thấy | PASS | id=cmw0pyfsc0001k67oog8f2pet chỉ A + super |
| TEN-07 | P0 | Công ty không sửa/xoá được nguồn hệ thống | PATCH + DELETE source system (admin B) | HTTP 403 cả hai | PASS | PATCH=403, DELETE=403 |
| TEN-08 | P0 | Công ty B không sửa/xoá nguồn riêng của công ty A | PATCH + DELETE source A (admin B) | HTTP 403 cả hai | PASS | PATCH=403, DELETE=403 |
| TEN-09 | P0 | Bài viết công ty A không lộ sang công ty B | Tạo post A → list B + sửa chéo | B không thấy, sửa chéo 403 | PASS | id=post-1793712242049, B không thấy và không sửa được |

#### Bất động sản — `Properties` (9/9 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| PRP-01 | P1 | Tạo bất động sản thiếu listing_source bị từ chối | POST /api/properties {title} | HTTP 400 | PASS | Invalid option: expected one of "broker"\|"owner" |
| PRP-02 | P2 | Tiêu đề quá ngắn bị từ chối | POST /api/properties title="AB" | HTTP 400 | PASS | Tiêu đề bất động sản phải có ít nhất 3 ký tự. |
| PRP-03 | P0 | Tạo bất động sản hợp lệ gắn đúng công ty | POST /api/properties (admin A) | HTTP 200, company_id=comp-da-nang | PASS | id=p-1793712242059 |
| PRP-04 | P0 | Đọc chi tiết bất động sản cùng công ty | GET /api/properties/:id (admin A) | HTTP 200 đúng id | PASS | title=Đất Nền QA Property A-1793712242057-b8tr7 Nam Hòa Xuân Đà Nẵng - Tâm Điểm Nam Hòa Xuân |
| PRP-05 | P1 | Cập nhật bất động sản của chính công ty | PUT /api/properties/:id {price} | HTTP 200, giá mới | PASS | price=3.1 |
| PRP-06 | P1 | Quick-parse văn bản tin đăng | POST /api/properties/quick-parse | HTTP 200, nhận diện loại đất nền + giá | PASS | type=Đất nền, price=2 |
| PRP-07 | P1 | Member tạo được bất động sản riêng | POST /api/properties (member A) | HTTP 200, company A | PASS | id=p-1793712242080 |
| PRP-08 | P0 | Member không sửa được bất động sản của quản trị công ty | PUT /api/properties/:id (member A → property admin A) | HTTP 403 | PASS | HTTP 403 |
| PRP-09 | P2 | Xoá mềm bất động sản và ẩn khỏi danh sách công khai | DELETE /api/properties/:id (admin A) | HTTP 200, sale_status=hidden | PASS | sale_status=hidden |

#### CRM khách hàng — `Customers` (6/6 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| CRM-01 | P0 | Tạo khách hàng với giá trị mặc định | POST /api/customers (admin A) | HTTP 200, lead_score=50, company A | PASS | id=c-1793712242090, lead_score=50 |
| CRM-02 | P1 | Phân trang danh sách khách hàng | GET /api/customers?page=1&limit=5 | HTTP 200, items ≤ 5 và có total | PASS | items=5, total=22 |
| CRM-03 | P1 | Cập nhật khách hàng và ghi chú | PUT /api/customers/:id | HTTP 200, notes mới | PASS | notes + lead_score=77 |
| CRM-04 | P2 | Tìm kiếm khách hàng theo tên | GET /api/customers?search=<unique> | HTTP 200, có bản ghi vừa tạo | PASS | 1 kết quả |
| CRM-05 | P2 | Xoá khách hàng của công ty | DELETE /api/customers/:id (admin A) | HTTP 200 | PASS | Đã xoá |
| CRM-06 | P1 | XSS trong tên khách hàng được lưu an toàn phía API | POST /api/customers name chứa <script> | HTTP 200 JSON, không thực thi/dịch chuyển | PASS | Lưu nguyên chuỗi, trả JSON |

#### Nội dung / bài viết — `Content` (7/7 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| CNT-01 | P1 | Tạo bài viết cho công ty | POST /api/posts (admin A) | HTTP 200, company A | PASS | id=post-1793712242107 |
| CNT-02 | P1 | Cập nhật bài viết của công ty | PUT /api/posts/:id | HTTP 200, nội dung mới | PASS | Đã cập nhật |
| CNT-03 | P2 | Xoá bài viết của công ty | DELETE /api/posts/:id | HTTP 200 | PASS | Đã xoá |
| CNT-04 | P1 | Super Admin đọc hộp thư Facebook | GET /api/inbox | HTTP 200 | PASS | items=4 |
| CNT-05 | P1 | Công ty có entitlement fb_inbox đọc được hộp thư | GET /api/inbox (admin A) | HTTP 200 | PASS | items=4 |
| CNT-06 | P2 | Lịch sử chat nội bộ tải được | GET /api/chat/history (super) | HTTP 200 | PASS | HTTP 200 |
| CNT-07 | P2 | Trạng thái AI khả dụng cho user đã đăng nhập | GET /api/ai/status | HTTP 200 | PASS | provider=n/a |

#### Lịch hẹn xem nhà — `Appointments` (7/7 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| APT-01 | P1 | Đặt lịch công khai thiếu trường bắt buộc bị từ chối | POST /api/public/appointments thiếu phone | HTTP 400 | PASS | Vui lòng cung cấp đầy đủ: Tên, Số điện thoại và Thời gian hẹn xem nhà. |
| APT-02 | P1 | Đặt lịch với thời gian không hợp lệ bị từ chối | POST /api/public/appointments appointmentTime="abc" | HTTP 400 | PASS | Thời gian hẹn xem nhà không hợp lệ. |
| APT-03 | P0 | Đặt lịch thành công gắn đúng công ty của bất động sản | POST /api/public/appointments property A | HTTP 201, companyId=comp-da-nang | PASS | id=apt_1793712242142_kug0v |
| APT-04 | P0 | Lịch hẹn chỉ hiển thị trong công ty sở hữu | GET /api/appointments (A vs B) | A thấy, B không thấy | PASS | A thấy, B không thấy |
| APT-05 | P0 | Công ty B không cập nhật lịch hẹn của công ty A | PATCH /api/appointments/:id (admin B) | HTTP 403 | PASS | HTTP 403 |
| APT-06 | P1 | Công ty A xác nhận lịch hẹn thành công | PATCH status=confirmed (admin A) | HTTP 200, status=confirmed | PASS | confirmed |
| APT-07 | P2 | Trạng thái lịch hẹn không hợp lệ bị từ chối | PATCH status=hacked | HTTP 400 | PASS | Dữ liệu lịch hẹn không hợp lệ. |

#### License & PEM — `License` (10/10 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| LIC-01 | P0 | Super Admin xem được toàn bộ license | GET /api/admin/licenses (super) | HTTP 200 array | PASS | keys=9 |
| LIC-02 | P0 | Quản trị công ty không xem được license toàn hệ thống | GET /api/admin/licenses (admin A) | HTTP 403 | PASS | HTTP 403 |
| LIC-03 | P1 | User mới chưa có key bản quyền | GET /api/license/my-license (user QA mới) | HTTP 200, hasKey=false | PASS | hasKey=false, plan=none |
| LIC-04 | P0 | Cấp trial một lần, key đúng định dạng XXXX-XXXX-XXXX-XXXX | POST /api/license/download-trial | HTTP 200, key đúng format, plan=premium_trial | PASS | key=EZ9H-****-****-****, plan=premium_trial |
| LIC-05 | P0 | Tải trial lần 2 idempotent, không cấp thêm key | POST download-trial lần 2 | HTTP 200, cùng key, hasExistingKey=true, không tạo key mới | PASS | idempotent, keys=1 |
| LIC-06 | P0 | Key có thể mở lại (idempotent) và trả PEM | GET /api/license/my-key | HTTP 200, cùng key, có pem, activeDevices=0 | PASS | Key trùng + PEM + 0 thiết bị |
| LIC-07 | P1 | Kích hoạt key sai bị từ chối | POST /api/license/activate invalid key | HTTP 400 INVALID_KEY | PASS | HTTP 400 INVALID_KEY |
| LIC-08 | P0 | Kích hoạt thiết bị bằng key hợp lệ | POST /api/license/activate | HTTP 200, accessToken + refreshToken | PASS | Kích hoạt thành công, 1 thiết bị |
| LIC-09 | P1 | Heartbeat thiết bị hợp lệ | POST /api/license/heartbeat | HTTP 200 valid=true | PASS | valid=true |
| LIC-10 | P0 | Thu hồi key chặn truy cập ngay lập tức | POST /api/admin/licenses/:id/revoke → my-key | revoke 200, my-key 403 KEY_REVOKED | PASS | my-key=403, heartbeat=403 |

#### Ví token — `Wallet` (10/10 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| WAL-01 | P0 | User xem ví của mình | GET /api/wallet/my (admin A) | HTTP 200, balance, planCosts | PASS | balance=0 |
| WAL-02 | P0 | Super Admin xem toàn bộ ví | GET /api/admin/wallets (super) | HTTP 200 array | PASS | wallets=35 |
| WAL-03 | P0 | Quản trị công ty không xem được ví toàn hệ thống | GET /api/admin/wallets (admin A) | HTTP 403 | PASS | HTTP 403 |
| WAL-04 | P1 | Cộng token thiếu ghi chú bị từ chối | POST /api/admin/wallets/deposit không note | HTTP 400 | PASS | Ghi chú/lý do giao dịch là bắt buộc. |
| WAL-05 | P1 | Cộng 0 token hoặc số lẻ bị từ chối | POST deposit amount=0 và 1.5 | HTTP 400 cả hai | PASS | amount=0 → 400, amount=1.5 → 400 |
| WAL-06 | P0 | Trừ quá số dư bị chặn | POST deposit amount=-999999 | HTTP 400, số dư không đổi | PASS | HTTP 400, số dư giữ nguyên |
| WAL-07 | P0 | Cộng/trừ token hợp lệ cập nhật số dư và giao dịch | POST deposit +100 rồi -100 | HTTP 200, balance +100 rồi về gốc | PASS | balance=0, transactions QA=2 |
| WAL-08 | P1 | Ví frozen chặn giao dịch | Đặt wallet.status=frozen → deposit | HTTP 400, thông báo frozen | PASS | HTTP 400, ví bị khoá |
| WAL-09 | P1 | Nâng cấp license với gói không hợp lệ bị từ chối | POST /api/wallet/upgrade-license plan=gold | HTTP 400 | PASS | Gói nâng cấp không hợp lệ (hỗ trợ pro hoặc enterprise). |
| WAL-10 | P1 | Nâng cấp license khi không đủ token bị chặn | POST upgrade-license plan=pro (ví 0) | HTTP 400, số dư không âm | PASS | HTTP 400: Số dư token không đủ để nâng cấp gói PRO! Cần: 100 token, số dư khả dụng hiện tạ |

#### Nguồn AI Agent — `Agent sources` (14/14 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| AGT-01 | P0 | Super Admin xem dashboard agent | GET /api/agent/dashboard (super) | HTTP 200 object | PASS | keys=activeSources,queuedJobs,runningJobs,newFindings,unreadNotifications,jobsFailed24h |
| AGT-02 | P1 | Công ty có entitlement xem dashboard agent | GET /api/agent/dashboard (admin A) | HTTP 200 | PASS | HTTP 200 |
| AGT-03 | P1 | Member xem được danh sách nguồn (read-only) | GET /api/agent/sources (member A) | HTTP 200 | PASS | sources=20 |
| AGT-04 | P1 | Tạo nguồn thiếu tên bị từ chối | POST /api/agent/sources {} | HTTP 400 | PASS | Tên nguồn là bắt buộc. |
| AGT-05 | P1 | Loại nguồn không hợp lệ bị từ chối | POST type=twitter | HTTP 400 | PASS | type phải là một trong: facebook_group, website, forum, search |
| AGT-06 | P1 | URL nguồn không hợp lệ bị từ chối | POST url="not-a-url" | HTTP 400 | PASS | url không hợp lệ. |
| AGT-07 | P2 | Priority ngoài khoảng 1-10 bị từ chối | POST priority=99 | HTTP 400 | PASS | priority phải từ 1 đến 10. |
| AGT-08 | P0 | Công ty không được tạo nguồn hệ thống | POST scope=system (admin A) | HTTP 403 | PASS | HTTP 403 |
| AGT-09 | P0 | Tạo nguồn hệ thống trùng URL bị chặn | POST scope=system trùng URL | HTTP 409 | PASS | HTTP 409 |
| AGT-10 | P1 | Cập nhật nguồn riêng của công ty | PATCH /api/agent/sources/:id (admin A) | HTTP 200, priority mới | PASS | priority=7 |
| AGT-11 | P0 | Super Admin chuyển nguồn công ty thành nguồn hệ thống | PATCH scope=system (super) | HTTP 200, companyId=null | PASS | companyId=null, B đã thấy |
| AGT-12 | P1 | Enqueue quét nguồn tạo job | POST /api/agent/sources/:id/run (admin A) | HTTP 200, có job | PASS | job=cmw0pyg80000kk67o8hg558yk |
| AGT-13 | P1 | Xoá nguồn QA và dữ liệu liên quan | DELETE 2 nguồn QA (super) | HTTP 200 cả hai | PASS | Đã xoá 2 nguồn QA |
| AGT-14 | P2 | Giới hạn tối thiểu 5 phút giữa các lần quét | POST scanIntervalMinutes=1 | HTTP 400 | PASS | scanIntervalMinutes tối thiểu 5 phút. |

#### Website công khai — `Public site` (9/9 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| PUB-01 | P0 | Trang chủ công khai trả dữ liệu | GET /api/public/homepage | HTTP 200, properties array | PASS | properties=27 |
| PUB-02 | P0 | Danh sách bất động sản công khai | GET /api/public/properties | HTTP 200 array, không có bất động sản hidden | PASS | public=27 |
| PUB-03 | P1 | Hồ sơ môi giới công khai | GET /api/public/agents | HTTP 200 | PASS | agents=35 |
| PUB-04 | P2 | SEO keywords công khai | GET /api/public/seo | HTTP 200 có keywords | PASS | keywords OK |
| PUB-05 | P1 | Form liên hệ thiếu dữ liệu bị từ chối | POST /api/public/contact {} | HTTP 400 | PASS | Invalid input: expected string, received undefined |
| PUB-06 | P1 | robots.txt hợp lệ và trỏ sitemap | GET /robots.txt | HTTP 200, có Sitemap | PASS | robots.txt có Sitemap |
| PUB-07 | P1 | sitemap.xml trả XML | GET /sitemap.xml | HTTP 200, chứa <urlset> | PASS | bytes=17984 |
| PUB-08 | P2 | Trang chi tiết bất động sản theo slug | GET /bds-da-nang/:slug → canonical | HTTP 200 | PASS | slug=can-ho-qa-member-property-1793712242078-qygxm-da-nang-co-hoi-dau-tu-p-1793712242080 |
| PUB-09 | P2 | Short link chuyển hướng 302 | GET /s/:slug (link đang hoạt động) | HTTP 302 | PASS | /shophouse108 → https://bdsdanang.site/binh-hut-tai-loc-bo-song-han-ban-shophouse-sonata-s161-toa-do-yet-hau-ngay-cua-ngo-4-toa-thap-symphony-da-nang-p-1780974… |

#### Bảo mật API — `Security` (8/8 PASS)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | P0 | Header bảo mật helmet hiện diện | GET /api/health | nosniff, frame guard, CSP, referrer-policy | PASS | nosniff, frame=SAMEORIGIN, CSP+referrer OK |
| SEC-02 | P1 | JSON hỏng trả lỗi JSON 400 | POST /api/auth/login body không phải JSON | HTTP 400 JSON status=error | PASS | HTTP 400 JSON |
| SEC-03 | P1 | Body vượt giới hạn JSON_BODY_LIMIT bị từ chối 413 | POST /api/customers body vượt cấu hình | HTTP 413 | PASS | limit=25mb, HTTP 413 |
| SEC-04 | P1 | SQL injection trong tìm kiếm không phá dữ liệu | GET /api/customers?search=';DROP TABLE... | HTTP 200, bảng customers còn dữ liệu | PASS | customers=22 nguyên vẹn |
| SEC-05 | P0 | Mật khẩu lưu dưới dạng hash Argon2 | Đọc DB user admin A sau đăng nhập | Hash $argon2, không còn plaintext | PASS | hash=$argon2id$v=19$m=655… |
| SEC-06 | P1 | Đổi mật khẩu làm vô hiệu token cũ | PUT profile đổi mật khẩu → dùng token cũ | token cũ 401, mật khẩu mới đăng nhập được | PASS | token cũ bị vô hiệu, mật khẩu mới OK |
| SEC-07 | P2 | Đổi mật khẩu với mật khẩu hiện tại sai bị từ chối | PUT profile current_password sai | HTTP 400 | PASS | Mật khẩu hiện tại không đúng. |
| SEC-08 | P2 | Rate limit public API có header | GET /api/public/properties | Có header RateLimit/RateLimit-Policy | PASS | remaining=110 |

### 6.2 UI smoke (12 case)

Nguồn: `qa/ui-smoke.mjs`. Mỗi case dùng context trình duyệt mới, thao tác như người dùng thật trên server cô lập.

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | P0 | Trang chủ công khai render được | Mở / | HTTP 200, có tiêu đề House & Life và liên kết nội bộ | PASS | title="House & Life \| BĐS Đà Nẵng - Nhà Phố, Đất Nền Nam Hòa Xuân, …", links=32 |
| UI-02 | P0 | Trang chi tiết bất động sản render đúng | Mở canonical slug của BĐS public | HTTP 200, tiêu đề BĐS hiển thị | PASS | slug=ban-nha-3-tang-nam-hoa-xuan-100m-gia-6-5-ty-p-1792070744658 |
| UI-03 | P0 | Truy cập admin khi chưa đăng nhập bị chặn | Mở /admin/dashboard không session | Hiện form Đăng nhập Super Admin | PASS | url=/admin/login |
| UI-04 | P1 | Sai mật khẩu hiển thị lỗi, không vào được | Đăng nhập sai tại /admin/login | Lỗi "Email hoặc mật khẩu không đúng." | PASS | Hiển thị lỗi đúng, không mount sidebar |
| UI-05 | P0 | Super Admin đăng nhập và thấy menu quản trị | Đăng nhập /admin/login | Sidebar có Dashboard, Hồ sơ, Cấu hình, Phân quyền | PASS | url=/admin/dashboard |
| UI-06 | P0 | Menu Website Chat / Chat History đã bị gỡ | Đọc toàn bộ sidebar super admin | Không còn 2 menu đã gỡ | PASS | Không còn Website Chat / Chat History |
| UI-07 | P0 | Trang Nguồn render đúng sau refactor | Mở /admin/agents/sources | Tiêu đề "Nguồn quét (Sources)", không có error boundary | PASS | Trang Nguồn render ổn định |
| UI-08 | P0 | Tab ví giữ trạng thái qua URL và reload | Mở /admin/profile?tab=wallet → reload | Tab Ví active, URL & nội dung giữ nguyên | PASS | tab=wallet được giữ sau reload |
| UI-09 | P1 | Chuyển tab License cập nhật URL và giữ sau reload | Click tab "Key PEM & Agent" → reload | URL tab=license, nội dung khóa/PEM hiển thị | PASS | tab=license được giữ sau reload |
| UI-10 | P0 | Quản trị công ty đăng nhập cổng thành viên đúng quyền | Đăng nhập /dang-nhap bằng admin công ty | Thấy CRM + AI Agent, không thấy menu hệ thống | PASS | url=/my/dashboard, menu công ty đúng |
| UI-11 | P0 | Member không thấy menu quản trị người dùng/hệ thống | Đăng nhập /dang-nhap bằng member | Không có User & Permission / Cấu hình hệ thống | PASS | Menu member đúng phạm vi |
| UI-12 | P1 | Điều hướng trực tiếp route admin không crash | Mở lần lượt 4 route admin | Mỗi trang render, không có error boundary | PASS | 4 route render ổn |

### 6.3 Desktop Agent (15 case)

Nguồn: `qa/desktop-smoke.mjs`. Electron được build từ source, trỏ tới mock VPS để kiểm soát nguồn và manifest cập nhật; không chạy installer.

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| DESK-01 | P0 | Build desktop tạo đủ main/preload/renderer | Chạy npm run build:desktop và kiểm tra artifact | Đủ 3 bundle main, preload, renderer + index.html | PASS | 6 artifacts hợp lệ |
| DESK-02 | P0 | Cửa sổ Agent render đủ 5 tab điều hướng | Mở app, đọc thanh tab | Có Dashboard, Publisher, Facebook, Zalo, Cài đặt | PASS | 📊 Tổng quan \| 📢 Đăng bài AI \| 🌐 Facebook Web \| 💬 Zalo Web \| ⚙️ Cài đặt |
| DESK-03 | P0 | Agent tải nguồn Facebook từ VPS khi khởi động | Chờ đồng bộ nguồn từ mock VPS | Header hiển thị QA Source Alpha 1/2 và URL group | PASS | QA Source Alpha — https://www.facebook.com/groups/qa-test-1?sorting_setting=CHRONOLOGICAL, vpsConnected=true, sources=2 |
| DESK-04 | P1 | Chuyển nguồn kế tiếp / trước đó hoạt động | Bấm Nhóm kế tiếp rồi Nhóm trước | Header đổi sang QA Source Beta 2/2 rồi quay lại Alpha 1/2 | PASS | next → Beta 2/2, prev → Alpha 1/2 |
| DESK-05 | P0 | Cài đặt nạp đúng cấu hình đã lưu và phiên bản app | Mở tab Cài đặt | VPS URL = mock, phiên bản 1.1.0, auto-update tắt | PASS | vps=http://127.0.0.1:3200, version=1.1.0, sources=2/2 |
| DESK-06 | P0 | Danh sách nguồn trong Cài đặt hiển thị đủ và có nhãn hệ thống | Đọc checklist nguồn | 2 checkbox, cả hai có tag "Hệ thống" | PASS | QA Source AlphaHỆ THỐNG https://www.facebook.com/groups/qa-test-1 \| QA Source BetaHỆ THỐNG https://www.facebook.com/groups/qa-test-2 |
| DESK-07 | P0 | Bỏ tick nguồn được lưu ngay và áp dụng cho vòng quét | Bỏ tick QA Source Beta | enabledSourceIds=[qa-src-1], tóm tắt 1/2, dropdown còn 1 nguồn | PASS | Chỉ còn qa-src-1 trong settings + dropdown + stats |
| DESK-08 | P1 | Lưu cấu hình tốc độ quét xuống đĩa | Chọn tốc độ Nhanh, bấm Lưu cấu hình | getSettings và file JSON đều có scanSpeedMode=fast | PASS | scanSpeedMode=fast (IPC + file) |
| DESK-09 | P1 | Gửi tin Telegram thiếu cấu hình báo lỗi rõ ràng | Bấm Gửi tin thử khi chưa có token/chat id | Hiển thị "Thiếu Bot Token hoặc Chat ID.", app không crash | PASS | ❌ Thiếu Bot Token hoặc Chat ID. |
| DESK-10 | P0 | Kiểm tra cập nhật tải bản mới và xác minh SHA-256 | Click Kiểm tra cập nhật (manifest 9.9.9 hợp lệ) | latest=9.9.9, status=ready, file tải về khớp SHA-256 | PASS | 9.9.9 ready 100%, sha256 khớp, file=HouseAndLife-Agent-Setup-9.9.9.exe |
| DESK-11 | P0 | Updater từ chối file sai SHA-256 | Manifest 9.9.10 có sha256 sai, click Kiểm tra cập nhật | status=error chứa "SHA-256", file tải về bị xóa | PASS | Tệp cập nhật không khớp SHA-256 — đã hủy cài đặt. |
| DESK-15 | P1 | HMAC secret được mã hoá at-rest và giải mã đúng khi đọc lại | Nhập API key/secret giả, lưu cấu hình | File settings chứa enc:v1, không chứa plaintext; getSettings trả secret gốc | PASS | disk=enc:v1:djEwH…, IPC trả plaintext đúng |
| DESK-12 | P0 | Cấu hình và nguồn đã chọn được giữ sau khi khởi động lại | Đóng app, mở lại cùng user-data-dir | VPS URL, speed=fast, enabledSourceIds=[qa-src-1], secret giải mã đúng, 1 nguồn active | PASS | restart giữ vpsUrl, speed=fast, secret giải mã, 1 nguồn active |
| DESK-13 | P1 | Manifest thiếu trường bắt buộc bị từ chối an toàn | Manifest 9.9.11 thiếu sha256/url, click Kiểm tra cập nhật | status=error chứa "Manifest thiếu", app không crash | PASS | Manifest thiếu version/sha256/url. |
| DESK-14 | P1 | Không tự cài cập nhật khi người dùng tắt auto-update | Đọc state sau khi auto check khởi động (autoUpdateEnabled=false) | Không có tiến trình cài đặt, file giả không bị thực thi, app vẫn chạy | PASS | status=error, autoUpdate=off, không chạy installer |

### 6.4 Thủ công / static (3 case)

| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| MAN-01 | P0 | Tài khoản legacy lưu plaintext vẫn đăng nhập được và tự nâng cấp Argon2 | Seed user plaintext (`data.password`, `password_hash` NULL) → khởi động server mới cổng 3101 → login + /me → restart → login lại (qa/legacy-login-check.mjs) | HTTP 200, DB nâng cấp Argon2, plaintext bị xoá, đăng nhập vẫn sống sau restart | PASS | Login lần 1 và lần 2 sau restart đều 200; `/me` 200; `data.password_hash` bắt đầu `$argon2`; `data.password` đã bị xoá |
| MAN-02 | P1 | Không hardcode HMAC secret/API key của agent trong source | Quét desktop/src/main/index.ts và git diff tìm vpsApiSecret/vpsApiKeyId mặc định | Không có credential thật trong source; secret lưu at-rest dạng mã hoá | PASS | `defaultSettings.vpsApiKeyId/vpsApiSecret` để trống; `saveSettings` mã hoá secret bằng safeStorage (`enc:v1:`) — DESK-15 xác minh file settings không còn plain… |
| MAN-03 | P1 | Dữ liệu và tiến trình QA được dọn sạch sau khi test | Sau 3 suite: query user email qa.*, entitlement grantedBy=qa-runner, source/tên QA, customer QA; kiểm tra port 3100 | 0 bản ghi QA còn lại; không còn process listen port 3100 | PASS | qaUsers=0, entitlements=0, sources QA=0, customers QA=0; port 3100 chỉ còn TIME_WAIT, server QA đã dừng |

## 7. Defect log (tóm tắt)

| Defect | Mức | Khu vực | Mô tả | Test phát hiện | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| BUG-AUTH-01 | P0 | Đăng nhập legacy | `server/dbHelper.ts:149` map `data.password` vào `password_hash`, khiến nhánh `verifyPlaintextLegacy` không bao giờ chạy. | MAN-01 | **Đã fix & xác minh** |
| BUG-AUTH-02 | P0 | Đổi mật khẩu / token | `toAuthUser` không trả `token_version`; `signToken` mặc định 1 trong khi DB tăng lên 2 sau đổi mật khẩu. Mọi request sau đăng nhập mới bị 401. | AUTH-15, SEC-07 | **Đã fix & xác minh** |
| BUG-DESK-01 | P2 | Desktop UI | Renderer gọi `update:get-state` trước khi `AgentUpdater` được tạo, nhận `null`, hiển thị trống phiên bản và "Không có thông tin cập nhật." | DESK-05 | **Đã fix & xác minh** |
| BUG-SEC-01 | P1 | Desktop security | HMAC API key/secret mặc định bị hardcode trong `desktop/src/main/index.ts:72-74`. | MAN-02, DESK-15 | **Đã fix & xác minh** |

Tóm tắt fix:

- BUG-AUTH-01: bỏ fallback `data.password` khi nạp cache; login legacy đi đúng nhánh plaintext và nâng cấp Argon2.
- BUG-AUTH-02: `toAuthUser` trả `token_version` từ user record để token mới mang đúng phiên bản.
- BUG-DESK-01: `update:get-state` trả state `idle` mặc định trước khi updater khởi tạo.
- BUG-SEC-01: bỏ credential hardcode; mã hoá `vpsApiSecret`/`telegramBotToken` at-rest bằng `safeStorage`.

Chi tiết bằng chứng, root cause và khuyến nghị sửa: `docs/qa/EXECUTION_REPORT.md`.

## 8. Truy vết tự động hoá

| Lệnh | Mục đích |
| --- | --- |
| `node qa/desktop-smoke.mjs` | Build/launch Electron, chạy 15 case desktop với mock VPS. |
| `node qa/api-e2e.mjs` | Chạy 121 case API black-box (cần server QA port 3100). |
| `node qa/ui-smoke.mjs` | Chạy 12 case UI Playwright (cần server QA port 3100). |
| `node qa/legacy-login-check.mjs` | Seed user plaintext, khởi động server riêng port 3101, xác minh login + nâng cấp Argon2 + restart. |
| `npm run build:desktop` | Build bundle desktop trước khi smoke. |

Script dùng state tạm `runtime/qa/state.json` và tự khôi phục user/entitlement nếu lần chạy trước bị gián đoạn.

## 9. Khoảng trống và backlog (NOT RUN)

Các khu vực sau chưa được kiểm thử sâu trong phiên này và cần bổ sung trước khi phát hành lớn:

- Đăng nhập Facebook/Zalo thật, quét GraphQL thật, gửi lead thật tới VPS production.
- Gửi Telegram thật (chỉ kiểm tra nhánh thiếu cấu hình).
- Chạy installer cập nhật desktop thật và rollback khi lỗi; kiểm tra chữ ký số installer.
- Publish hàng loạt lên group Facebook thật, rate limit và xử lý checkpoint tài khoản.
- Kiểm thử tải/performance cho API public, ingest agent và job worker.
- Kiểm thử đa trình duyệt (Firefox/Safari), responsive mobile, accessibility.
- Kiểm thử thanh toán thật, đối soát ví và hoàn tiền.
- Kiểm thử backup/restore PostgreSQL và migration Prisma trên dữ liệu lớn.

Trạng thái các mục trên: **NOT RUN** — cần môi trường/tài khoản thật và sự phê duyệt riêng.

## 10. Tiêu chí kết thúc

- 100% case P0 PASS trước khi coi build là releasable.
- Không còn defect P0/P1 mở; P2 có kế hoạch sửa và workaround.
- Dữ liệu QA và tiến trình test được dọn sạch (MAN-03 PASS).
- Chạy lại 3 suite trên build cuối cùng và lưu artifact kết quả.
