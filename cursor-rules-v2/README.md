# Cursor Rules v2 — tighter, less token

## Vấn đề của bộ rules cũ
5 file `.mdc`, **cả 5 đều `alwaysApply: true`** → mỗi request (kể cả sửa 1 dòng CSS) đều nạp:
- ~130 dòng rules
- `ENGINEERING_CONSTITUTION.md` (591 dòng, bị ép đọc theo `engineering-constitution.mdc`)
- `PROJECT_STRUCTURE.md` (155 dòng)
- toàn bộ `docs/adr/*` (8 file, 423 dòng)

≈ 1.300 dòng / request chỉ để "khởi động", trước khi Agent chạm vào code thật.

## Thay đổi

| Cũ | Mới | Thay đổi |
|---|---|---|
| `architecture-first.mdc` (always) | gộp vào `10-architecture-gate.mdc` (conditional) | chỉ bật khi task là feature/refactor/bugfix thật, không bật khi task nhỏ (sửa text, style, 1 dòng bugfix rõ ràng) |
| `engineering-constitution.mdc` (always, ép đọc 591 + 155 + 423 dòng) | trỏ vào `CONSTITUTION-QUICKREF.md` (~60 dòng) trong `10-architecture-gate.mdc` | không ép đọc full constitution + toàn bộ ADR mỗi lần; chỉ đọc ADR cụ thể **nếu** task đụng đúng quyết định đó |
| `impact-analysis.mdc` (always) | gộp vào `10-architecture-gate.mdc` (conditional) | cùng điều kiện bật như architecture-gate — 1 rule thay vì 2 |
| `product-philosophy.mdc` (always) | `20-product-context.mdc` (Agent Requested — Cursor tự quyết định nạp dựa vào description, không ép cứng) | chỉ liên quan khi bàn về phạm vi sản phẩm, không cần cho mọi dòng code |
| `runtime-boundary.mdc` (always) | **giữ nguyên, vẫn always** — `00-runtime-boundary.mdc` | đây là rule an toàn, rẻ (26 dòng), giá trị bảo vệ cao hơn phí token — giữ always là đúng |
| *(mới, không có bản cũ)* | `30-doc-hygiene.mdc` (Agent Requested) | quy định file mới thuộc loại nào thì đi vào đâu (`RUNBOOK.md` / `docs/history/` / xoá trước khi merge) — chống việc `docs/` và `scripts/` phình lại như cũ |

## Kết quả

- Task nhỏ (fix text, style, 1-dòng bugfix rõ ràng): chỉ nạp `00-runtime-boundary.mdc` (~26 dòng) →
  giảm ~98% overhead cố định so với trước.
- Task lớn (feature/refactor/bugfix ảnh hưởng nhiều module): nạp `00` + `10` + `CONSTITUTION-QUICKREF`
  (~26 + ~40 + ~60 ≈ 126 dòng) thay vì ~1.300 dòng — vẫn giữ kỷ luật "architecture-first" nhưng không
  đọc lại toàn bộ constitution + toàn bộ ADR mỗi lần.
- ADR: chỉ đọc đúng ADR liên quan (rule chỉ ra cách tra — theo tên module), không đọc cả 8 file.

## Cách cài

```bash
# Trong repo real-estate-ai-marketing-agent-cms
git mv .cursor/rules .cursor/rules.old-backup
mkdir .cursor/rules
cp 00-runtime-boundary.mdc 10-architecture-gate.mdc 20-product-context.mdc .cursor/rules/
cp CONSTITUTION-QUICKREF.md docs/engineering/CONSTITUTION-QUICKREF.md
# Giữ nguyên ENGINEERING_CONSTITUTION.md + PROJECT_STRUCTURE.md + docs/adr/* làm tài liệu tham chiếu sâu,
# không xoá — chỉ không còn bị ép đọc toàn bộ mỗi request.
```

Sau khi cài, thử 1 task nhỏ ("sửa màu button X") — Agent không nên tự mở constitution/ADR nữa.
Thử 1 task lớn ("thêm module Y ảnh hưởng agent + control-plane") — Agent nên tự nêu Architecture
Audit / Impact Analysis như cũ, nhưng dựa trên bản quickref thay vì đọc lại 591 dòng.
