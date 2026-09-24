# Target Architecture (plan only — no bulk moves in R0)

```
server/agent-domain     # types, extractors, classification, scoring, resolver, lifecycle
server/agent-api        # routes, auth, DTO
server/agent-worker     # browser, adapters, jobs (exists)
server/agent-sync       # outbox, ingest client, HMAC
server/notifications    # CMS + Telegram (exists)
server/crm              # investor / customer conversion
server/inventory        # external + official + matching
```

## Smells today

| Smell | Future |
|-------|--------|
| Dual contentNormalizer | agent-domain |
| Frontend `resolveLeadIntelligence` | shared domain |
| Prisma in routes | repositories |
| Notifications multi-call-site | notifications facade |
| Routes importing worker concerns | split api/worker |

**Direction:** api/worker/sync → domain; frontend → API DTOs only; worker must not import React.
