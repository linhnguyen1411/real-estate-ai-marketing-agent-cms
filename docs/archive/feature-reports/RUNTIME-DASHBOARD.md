# Runtime Dashboard (Admin)

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER COMPLETE  
**Path:** `/admin/agents/runtime`

## Goal

Hiển thị Operations Center dạng Metrics (Fleet · Scanner · Publisher · Mission · Machines).

## Data source

`GET /api/agent/runtime` → `ControlPlane.getRuntime` gắn `operations` từ Metrics Collector.

`?refresh=1` buộc thu thập snapshot mới.

## Refresh policy

- Manual Refresh button
- Auto interval **5 phút** (không poll 8s)
- ErrorBoundary tránh trang trắng khi UI crash

## Sections

1. Fleet — online / busy / idle / CPU avg / RAM / browser busy·idle  
2. Scanner — sources / assigned / running / completed / findings / posts  
3. Publisher — draft / queue / publishing / published today / retry  
4. Mission — running / waiting / completed / failed  
5. Machines / Work — per-host CPU · RAM · jobs · browser · mission  
6. Legacy workers · queue · mission timeline (read-only observability)

## Related API

- `GET /api/agent/operations`
- `GET /api/agent/fleet`
