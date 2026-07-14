# Logging Standard

Gradual wrapper migration — no wholesale rewrite in R0.

**Fields:** service, workerId, jobId, sourceId, contentId, findingId, ingestionId, eventType, durationMs, errorCode.

**Never log:** secrets, tokens, cookies, full storage, full post body (preview ≤ 200–400 chars), unmasked phone dumps at info.

**Issues:** scattered `console.*`; missing correlation on some sync/ingest paths.

**Rotation:** PM2/OS logrotate 7–14d for API + worker. `*.log` gitignored.
