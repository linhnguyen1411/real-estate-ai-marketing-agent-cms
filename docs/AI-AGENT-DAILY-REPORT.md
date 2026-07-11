# AI Agent — Mission templates & Daily report (Sprint 7.1)

## Mission templates

Catalog (không seed DB): `server/agent/missionTemplates.ts`

| ID | Tên |
|----|-----|
| `land-fund-buyers-south-danang` | Tìm khách mua quỹ đất lớn Nam Đà Nẵng |
| `commercial-lease-danang` | Tìm khách thuê mặt bằng Đà Nẵng |
| `apartment-demand-watch` | Theo dõi nhu cầu căn hộ |
| `group-hot-topics` | Theo dõi chủ đề nổi bật trong các group |
| `selected-re-websites` | Đọc các website bất động sản được chọn |

Mỗi template có: `objective`, `sourceIds` (rỗng — gắn khi tạo), positive/negative keywords, `minFindingScore`, `notifyScore`, `maxItemsPerRun`, `schedule`, `analysisInstructions`.

### API

| Method | Path |
|--------|------|
| GET | `/api/agent/missions/templates` |
| POST | `/api/agent/missions/from-template` body: `{ templateId, sourceIds?, name?, objective?, status? }` |

UI: Mission → **Từ template**.

---

## Daily report

`server/agent/dailyReportService.ts`

**Số liệu định lượng chỉ từ DB** (ngày theo `Asia/Ho_Chi_Minh`):

- Nguồn đã quét (`lastScannedAt` trong ngày)
- Bài mới (`ScannedContent.collectedAt`)
- Findings theo score (hot/warm/cool + buckets)
- Top lead
- Nguồn hiệu quả nhất (groupBy findings)
- Nhóm nhu cầu (keywords từ `reasons` / `extractedData` của finding)
- Job lỗi
- Browser session health (status, needs_login, stale heartbeat)

**AI** chỉ viết đoạn tóm tắt từ JSON metrics đã truy vấn — prompt cấm bịa số.

### API / UI

| | |
|--|--|
| GET | `/api/agent/reports/daily?date=YYYY-MM-DD&includeAiSummary=true` |
| UI | `/admin/agents/reports` |

Response: `{ metrics, aiSummary, aiSummaryError, dataSource: "database" }`
