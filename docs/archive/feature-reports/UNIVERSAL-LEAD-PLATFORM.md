# Universal Lead Platform (H0.9)

Audit + design only. **No new scanner** in H0.

## Sources (roadmap)

Facebook · Threads · Instagram · TikTok · Website · Forum · Google

## Pipeline

```
Mission
  → Connector (source-specific)
  → Normalizer (canonical Lead)
  → AI enrich / score
  → CRM / Sales
```

## Current baseline

- Facebook group scan + findings + lead intelligence (`shared/agent-domain`, agent-worker Facebook adapters)
- Website reader adapter
- Dedup / spam / classification already exist

## Gaps vs universal platform

| Gap | Notes |
|-----|-------|
| Connector interface | Not formalized per network |
| Canonical Lead schema | Partial (finding ↔ investor lead) |
| Multi-network missions | Facebook-centric today |
| CRM sync | Thin / manual |

## Principle

Reuse Mission Engine + Execution Agent. Add connectors, not new queues.
