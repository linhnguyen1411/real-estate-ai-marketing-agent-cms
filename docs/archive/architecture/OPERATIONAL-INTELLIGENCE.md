# Operational Intelligence

Read-only intelligence layer for the AI Operations Copilot.

## Principle

Intelligence **observes** Operations Metrics Snapshot + Fleet Registry + failed-job error hints.

It does **not**:

- Poll browsers
- Own Scanner / Publisher business rules
- Bypass Control Plane for mutations

## Signals

| Kind | Severity | Meaning |
|------|----------|---------|
| `idle_machine` | info | Online machine idle while queue has work |
| `hot_browser` | warning | Browser hold / busy |
| `memory_high` | warning | High RAM / RSS |
| `retry_loop` | warning | Many jobs retrying |
| `checkpoint` | critical | Facebook checkpoint / challenge |
| `offline_agent` | critical | Heartbeat lost |
| `queue_backlog` | warning/critical | Waiting jobs high |
| `slow_mission` | warning | Failures dominate completions |
| `publish_failure` | warning/critical | Publish retry / failed jobs |
| `source_removed` | critical | Source deleted — retry useless |
| `browser_locked` | warning | CDP/browser lock |
| `slot_full` | info | Execution slot saturated |
| `scanner_idle` | info | No assigned/running scan work |
| `health_low` | warning/critical | Fleet health score low |

## Runtime explain

`explainScannerIdle(ops)` answers “Tại sao Scanner không chạy?” with one primary cause:

1. No online machines  
2. No pending / assigned sources  
3. Execution slots full  
4. Browser locked  
5. Actually running  

## Recommendation mapping

Each incident maps to a Control Plane action label + optional slash command.

Mutations always go: **Copilot → Control Plane Port / Command Engine → domain services**.

## Daily briefing composition

Uses the same signal + recommendation set so morning/noon/evening briefs stay consistent with on-demand Incident Center.

## Extension

Add new `OpsIncidentKind` values in `operationalIntelligence.ts`, then a case in `recommendations.ts`. Keep formatters free of Prisma.
