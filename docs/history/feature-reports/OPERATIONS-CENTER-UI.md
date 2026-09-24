# Operations Center UI

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER UI COMPLETE  
**Commit intent:** `refactor(ui): redesign operations center dashboard`

## Goal

Biến `/admin/agents/runtime` thành **Mission Control** — trả lời ngay máy nào đang làm gì, không chỉ KPI.

## Scope

Presentation layer only.

- Không sửa API
- Không sửa Runtime / Metrics Collector
- Không sửa Mission / Scanner / Publisher / Telegram
- Không đổi data model

## Layout

**Mobile:** stacked accordions — Fleet → Operations → Timeline & Alerts (no horizontal scroll)

**Desktop (lg+):** 3 columns

1. Fleet cards  
2. Scanner · Publisher · Mission · Browser  
3. Quick Actions · Alerts · Activity Timeline  

## Components

```
src/features/agent/runtime-monitor/
  pages/RuntimeMonitorPage.tsx
  components/
    OpsCenterHeader.tsx
    FleetPanel.tsx
    OperationsPanels.tsx
    ActivityAlerts.tsx
    OpsPrimitives.tsx
  utils/deriveAlerts.ts
```

## Refresh

Manual Refresh + 5-minute snapshot interval. Không polling 8s.

## Tests

```bash
node scripts/test-operations-center-ui.mjs
npm run lint
```
