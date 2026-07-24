# Architecture Decision Records (ADR)

Large structural decisions for the AI Sales Employee platform.

| ADR | Title |
|-----|-------|
| [ADR-001](./ADR-001-stateless-execution.md) | Stateless Execution |
| [ADR-002](./ADR-002-browser-lease.md) | Browser Lease |
| [ADR-003](./ADR-003-decision-engine.md) | Decision Engine |
| [ADR-004](./ADR-004-knowledge-center.md) | Knowledge Center |
| [ADR-005](./ADR-005-campaign-workspace.md) | Campaign Workspace |

## When to write an ADR

- New bounded context or module boundary  
- Choice that locks Runtime / Browser / Decision / Knowledge / Campaign architecture  
- Rejecting a tempting alternative (`V2` module, dual SSOT, etc.)

## Template

```markdown
# ADR-XXX — Title

## Problem
…

## Alternatives
1. …
2. …

## Decision
…

## Consequences
- Positive:
- Negative / tradeoffs:
- Follow-ups:
```

Parent law: [Engineering Constitution](../engineering/ENGINEERING_CONSTITUTION.md).
