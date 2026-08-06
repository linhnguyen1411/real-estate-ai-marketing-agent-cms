# ENV Catalog

**Date:** 2026-07-14 · source `.env.example` + runtime reads.

| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | active / secret / required | |
| `PORT` `HOST` `JSON_BODY_LIMIT` | active | |
| AI: `GEMINI_*` `OPENAI_*` `OLLAMA_*` `DEFAULT_AI_MODE` | active / secret | |
| `APP_URL` | active | |
| Facebook Graph credentials + verify | active / secret | webhook live |
| `FACEBOOK_GRAPH_LEGACY_ENABLED` | **active gate** (default **true** if unset) | Webhooks/admin Graph |
| `AGENT_ENABLED` | **active gate** (default **true** if unset) | Admin agent routes + scheduler/outbox |
| `AGENT_SCHEDULER_ENABLED` | active | |
| `AGENT_INGEST_ENABLED` | active / VPS | |
| `AGENT_TELEGRAM_ENABLED` | active | + Settings |
| `AGENT_LOCAL_SYNC_*` | active / local | |
| `AGENT_SYNC_*` secrets/url | active / secret | Prefer CMS Settings |
| `AGENT_SYNC_BATCH_SIZE` env | unused | Settings `agent_sync_batch_size` used |
| Worker browser / CDP / profile | active / local | |
| `AGENT_LEAD_ANALYSIS_*` / `AGENT_ANALYSIS_MODE` | active | |
| `AGENT_FB_DEBUG_SCREENSHOTS` | active debug | |
| `AGENT_FB_DEBUG_TRACES` | **unread** | drop or implement |

Do not delete production keys without migration plan. Prefer single config loader in later phase.
