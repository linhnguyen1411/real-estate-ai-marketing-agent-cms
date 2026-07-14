# Data Retention Policy

Never auto-delete: ScannedContent, AgentFinding, CRM Lead, External/Official Inventory.

| Table | Retention |
|-------|-----------|
| AgentJob completed/failed/cancelled | 30d |
| BrowserSession offline | 14d |
| AgentIngestNonce | after `expiresAt` |
| TelegramDeliveryLog | 60d |
| AgentIngestionEvent | 90d |
| AgentSyncOutbox `synced` | 30d (`syncedAt`/`createdAt`) |
| Debug screenshots/files | 7–14d via `cleanup:agent-runtime` |

```bash
npm run cleanup:db-tech-retention
npm run cleanup:db-tech-retention -- --apply
```

Dry-run default. Prefer singleton `server/prisma.ts`.
