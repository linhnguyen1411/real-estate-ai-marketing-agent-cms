# docs/history — Index

`docs/archive/` sau khi chạy `04-cleanup-phase1` chỉ là **gom thô theo tên thư mục gốc**, không nói lên được "hệ thống đã trải qua gì" và "hướng refactor tiếp theo là gì". Đề xuất: đổi tên `docs/archive/` → `docs/history/` (tên đúng ý nghĩa hơn — đây là **lịch sử**, không phải rác), và thêm 1 file index để tra cứu nhanh thay vì phải mở từng trong 164 file.

```powershell
git mv docs/archive docs/history

```

## Cách đọc thư mục này

Không đọc lướt qua từng file — đọc theo **3 file định hướng** trước, chúng tóm tắt lại toàn bộ:


| File                                                                                | Trả lời câu hỏi                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `docs/history/audit/ARCHITECTURE-STATUS.md`                                         | Kiến trúc hiện tại đóng băng ở đâu, cái gì "frozen — không đổi trong H0"                          |
| `docs/history/audit/TECHNICAL-DEBT.md`                                              | Nợ kỹ thuật đã biết, hotspot nào (server.ts, agentRoutes.ts...)                                   |
| `docs/history/architecture/LARGE-FILE-INVENTORY.md` + `FRONTEND-LARGE-FILE-DEBT.md` | File nào to, đã tách tới đâu, còn phải tách gì — **chính là input cho** `03-module-split-plan.md` |


Sau đó mới đào sâu theo nhóm bên dưới nếu cần lý do "tại sao" cho 1 quyết định cụ thể.

## Bản đồ theo nhóm (164 file, giữ nguyên toàn bộ nội dung)


| Thư mục                                                                         | Nội dung                                                                                                        | Khi nào cần mở lại                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/history/refactor/` (30 file)                                              | Nhật ký các đợt refactor R0/R1/R2, baseline trước/sau, dead-code-candidates                                     | Khi cần biết 1 quyết định refactor cũ (vd. tại sao xoá `main-new.tsx`) đã dựa trên bằng chứng gì                  |
| `docs/history/architecture/` (55 file)                                          | Snapshot kiến trúc automation platform (Fleet, Browser Lease, Execution Pool, Control Plane...) theo từng batch | Khi sửa đúng subsystem đó và cần hiểu thiết kế gốc trước khi đổi                                                  |
| `docs/history/production-release/` (~20 file, sau khi move nốt `docs/release/`) | Log burn-in, rollback, verification của từng lần release                                                        | Khi 1 bug production hiện tại giống pattern đã từng gặp — tra cứu cách đã xử lý                                   |
| `docs/history/audit/` (3 file)                                                  | Snapshot audit toàn hệ thống tại 1 mốc thời gian                                                                | Điểm khởi đầu để hiểu "hệ thống lúc đó ra sao", so sánh với hiện tại                                              |
| `docs/history/feature-reports/` (65 file)                                       | Báo cáo/tài liệu theo từng tính năng (Telegram, Facebook publishing, SEO, Lead Magnet...)                       | Khi sửa đúng tính năng đó, tra lại quyết định thiết kế ban đầu                                                    |
| `docs/adr/` (giữ nguyên vị trí, KHÔNG move vào history)                         | 8 Architecture Decision Record — quyết định kiến trúc gốc, không đổi                                            | Vẫn là nguồn "tại sao" chính thức, tách riêng khỏi lịch sử vì đây là quyết định đang hiệu lực, không phải nhật ký |


## Nguyên tắc dùng thư mục này

- **Không** để bất kỳ rule Cursor nào tự động đọc cả thư mục này (đã fix ở `10-architecture-gate.mdc` — chỉ trỏ vào `CONSTITUTION-QUICKREF.md`, không ép đọc `docs/history/`*).
- Agent/người **chủ động mở** đúng file cần khi debug/refactor 1 subsystem cụ thể — dùng bảng trên để tìm nhanh, không đọc tuần tự.
- Khi có 1 đợt audit/refactor mới → thêm file mới vào đúng nhóm trong `docs/history/`, cập nhật lại index này (xem rule `30-doc-hygiene.mdc` — quy định luôn việc này).

