# ADR-003 — Decision Engine

## Problem

Sending every scanned post to expensive LLM review is slow, costly, and inconsistent. Operators need explainable qualify/discard behavior.

## Alternatives

1. **LLM-first** — model decides everything.  
2. **Rule-first Decision Engine** — deterministic rules + gated AI only when needed; metrics for savings/quality.  
3. **Manual-only triage** — no automation.

## Decision

Adopt a **rule-first Decision Engine** (`decision-center`): rules and campaign maps are SSOT; AI is gated; Admin + Telegram report metrics (scanned → qualified, AI saving).

## Consequences

- Positive: Cheaper, auditable, reusable across Lead Workspace.  
- Negative: Rules require Knowledge feedback loop to stay accurate.  
- Follow-ups: Do not fork a parallel “decisionV2”; extend the existing module + ADR if paradigm changes.
