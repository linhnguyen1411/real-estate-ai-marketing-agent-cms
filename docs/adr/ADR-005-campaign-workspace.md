# ADR-005 — Campaign Workspace

## Problem

AI Sales Employee work spans research, missions, content, leads, and approval. Spreading this across CMS posts, ad-hoc scripts, and Runtime jobs hides the business lifecycle from CEOs and Telegram operators.

## Alternatives

1. **CMS posts as campaigns** — marketing calendar only.  
2. **Campaign Workspace (living campaigns)** — planning module owns lifecycle through waiting approval; Runtime only executes delegated jobs.  
3. **Fully Runtime-driven campaigns** — mix ops and business state in Fleet/Queue.

## Decision

**Campaign is the center.** Living campaigns live in `planning/` (Campaign Workspace): Planner → Research → Mission → Content → Decision/Leads → Waiting Approval. Telegram/Copilot and Admin Campaign Center are adapters. Execution Trace records the path for prompt/agent improvement — not for Runtime debugging.

## Consequences

- Positive: Clear CEO narrative; reuse planners; Protected Runtime stays execution-only.  
- Negative: Must resist inventing `campaignV2` outside planning.  
- Follow-ups: Executive KPIs and Trace analytics compose from campaign outcomes; Publisher remains a capability behind approval.
