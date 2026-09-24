# Intelligent Fleet Orchestrator (G2)

Control Plane **soft-assigns** jobs at claim time. Execution Agents stay pull-based, NAT-friendly, no open ports, no WebSocket, no push.

## Flow

```
Execution Agent
  → Heartbeat
  → Poll / claim
  → Placement Engine (best job for this agent)
  → Hydrated Job
  → Execute
```

Queue engine unchanged (`SKIP LOCKED`). Orchestrator only **ranks** candidates inside the claim window.

## Modules

| Piece | Path |
|-------|------|
| Orchestrator | `server/modules/control-plane/fleet-orchestrator/` |
| Placement | `placementEngine.ts` |
| Planner | `assignmentPlanner.ts` |
| Capabilities | `capabilityMatcher.ts` |
| Policies | `policies.ts` |
| Reservation / Cooldown | `reservationStore.ts` |
| Claim wire-up | `server/agent-worker/jobClaimer.ts` |

## Soft assignment

Control Plane returns *the best job for you*. Agent still claims via Runtime API. No push.

## Anti-hotspot

If an idle peer scores much higher for a job, an overloaded agent **skips** it (anti-steal).

## Ops

- Telegram: `/fleet`, `/fleet planner`, `/fleet drain <id>`, `/fleet policy spread|pack|…`
- Report: `/report fleet` includes planner lines
- Admin Fleet panel: placement-aware subtitle

## Out of scope

Mission Runtime · Scanner · Publisher · Browser Runtime · Queue Engine · Automation Engine · Execution/Browser Pool internals.
