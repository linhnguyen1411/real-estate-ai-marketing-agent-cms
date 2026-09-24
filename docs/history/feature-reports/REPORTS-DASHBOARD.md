# Reports Dashboard (Admin)

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER COMPLETE  
**Path:** `/admin/agents/reports`

## Goal

Tổng hợp Today · Last Hour · 24h · 7 Days từ Metrics Collector + Control Plane reports — **không** query Agent trực tiếp.

## Windows

| UI | Report kind |
|----|-------------|
| Today | daily (+ operations metrics) |
| Last Hour / 24h | runtime_health |
| 7 Days | weekly |

## Data sources

- `GET /api/agent/operations?refresh=1`
- `GET /api/agent/reports/control-plane?kind=`
- Daily report metrics (DB projections) giữ nguyên

## Operations strip

Machines online · Busy · Scan sources/running · Publish queue/publishing · Missions · Failed jobs

## Telegram parity

`/report today|week|fleet|runtime|publish|scan|…` dùng cùng Metrics / Report Engine.
