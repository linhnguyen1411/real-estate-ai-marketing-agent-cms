# ADR-006 — Constitution Final Lock (v2.1)

**Classification:** Infrastructure  
**KPI tier:** (meta — enables all tiers via governance)  
**Status:** Accepted  
**Date:** 2026-07-25

## Problem

Engineering rules were still growing (v1 → v2 → wish-lists). Unbounded Constitution edits create prompt noise, contradict “Single Source of Truth,” and invite every mission to invent new meta-rules instead of shipping Business Capability.

## Alternatives

1. Keep amending Constitution for every new process idea.  
2. Freeze Constitution at v2.1; route architecture evolution exclusively through ADRs.  
3. Delete Constitution and rely only on Cursor rules.

## Decision

Adopt **option 2**:

- `ENGINEERING_CONSTITUTION.md` **v2.1** is the **FINAL LOCK** Operating System.  
- **Do not** add new Constitution chapters/rules after H0.0.2.  
- Amend Constitution **only** when Product Philosophy or Engineering Principles change.  
- All other architecture / boundary / module decisions → new ADR.  
- North Star locked: **Generate Qualified Buyers Automatically.**

## Consequences

- Positive: Stable law; clear Prompt Policy; ADR trail for evolution; focus on Business Capability.  
- Negative / tradeoffs: Some process ideas must wait for ADR discipline instead of quick Constitution patches.  
- Follow-ups: Weekly Architecture Audit + `docs/evolution/` sprint lines; keep Cursor rules aligned without expanding Constitution.
