# Architecture Decision Records (ADR)

Large structural decisions for the AI Sales Employee platform.

Parent law: [Engineering Constitution v2.1 FINAL LOCK](../engineering/ENGINEERING_CONSTITUTION.md).

**Policy:** After Constitution v2.1, architecture change → **new ADR**. Do **not** edit the Constitution unless Product Philosophy or Engineering Principles change ([ADR-006](./ADR-006-constitution-final-lock.md)).

| ADR | Title | Classification |
|-----|-------|----------------|
| [ADR-001](./ADR-001-stateless-execution.md) | Stateless Execution | Infrastructure |
| [ADR-002](./ADR-002-browser-lease.md) | Browser Lease | Infrastructure |
| [ADR-003](./ADR-003-decision-engine.md) | Decision Engine | Core |
| [ADR-004](./ADR-004-knowledge-center.md) | Knowledge Center | Core |
| [ADR-005](./ADR-005-campaign-workspace.md) | Campaign Workspace | Business |
| [ADR-006](./ADR-006-constitution-final-lock.md) | Constitution Final Lock | Infrastructure |

## When to write an ADR

- New bounded context or module boundary  
- Choice that locks Runtime / Browser / Decision / Knowledge / Campaign architecture  
- Rejecting a tempting alternative (`V2` module, dual SSOT, etc.)  
- Any architecture change that is **not** a Product Philosophy / Engineering Principles rewrite  

## Template

```markdown
# ADR-XXX — Title

**Classification:** Core | Business | Infrastructure | Experimental  
**KPI tier:** Scanner | Finding | Lead | Qualified Buyer | Negotiation | Closed Won | Revenue  

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
