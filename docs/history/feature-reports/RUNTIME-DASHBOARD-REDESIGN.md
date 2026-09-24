# Runtime Dashboard Redesign

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER UI COMPLETE  
**Path:** `/admin/agents/runtime`

## Before → After

| Before | After |
|--------|-------|
| KPI grids + tables | Fleet cards + ops narrative panels |
| Horizontal scroll tables | Mobile accordion / stack |
| 8s poll (legacy) | Snapshot refresh 5m + manual |
| No alerts/timeline focus | Alerts + Activity Timeline column |

## Header

- Automation Operations Center  
- System Health  
- Fleet Status  
- Last Snapshot  
- Refresh  

## Fleet card fields

Machine · Online · Idle/Busy · CPU · RAM · Slots · Browser · Job · Mission · Action · Progress · Heartbeat

## Operations panels

- **Scanner** — sources/running/completed/posts/findings · progress · ETA · machines  
- **Publisher** — draft/queue/publishing/today/retry · draft · destination · step · machine  
- **Mission** — counts + running list · progress · machine · duration  
- **Browser** — profiles · busy/idle · Facebook · URL · locked by  

## Side rail

- Quick Actions (navigate-only: Jobs / Sessions / Notifications + Refresh)  
- Alerts (derived client-side from snapshot)  
- Activity Timeline (Runtime `events` or mission/job fallback)

## Design tokens

Dark glass · status badges · progress bars · skeleton · empty states  
Inspired by Grafana / Datadog / GitHub Actions / Vercel dark ops UIs.
