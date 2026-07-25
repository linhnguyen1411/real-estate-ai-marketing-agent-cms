# ADR-004 — Knowledge Center

## Problem

Buyer language, spam patterns, and campaign keywords drift. Hardcoded lists rot; every module invents its own dictionary.

## Alternatives

1. **Hardcoded dictionaries per module**  
2. **Central Knowledge Center** — concepts, trust, learning, feedback, coverage analytics  
3. **Only LLM memory** — opaque, expensive, hard to audit

## Decision

Maintain a **Knowledge Center** (`knowledge-base`) as SSOT for concepts/rules learning. Decision, Lead, and Campaign consume compiled knowledge; feedback loops adjust trust/weights.

## Consequences

- Positive: Shared language across Lead/Campaign; measurable coverage.  
- Negative: Requires discipline — no shadow keyword lists.  
- Follow-ups: Executive insights may read health/coverage; must not duplicate stores.
