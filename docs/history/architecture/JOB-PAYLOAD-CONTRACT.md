# Job Payload Contract (G1)

Worker reads `job.payload.execution` only (schema version `1`).

## Scan source

```json
{
  "sourceId": "…",
  "execution": {
    "schemaVersion": 1,
    "scan": {
      "jobType": "scan_source",
      "source": {
        "id": "…",
        "name": "…",
        "type": "facebook_group",
        "url": "https://…",
        "config": {},
        "checkpoint": null,
        "scanIntervalMinutes": 60
      },
      "mission": null,
      "missionRun": null,
      "browser": { "browserMode": "cdp", "cdpRequired": true },
      "retry": { "maxAttempts": 3, "attempts": 0 },
      "hydratedAt": "ISO-8601"
    }
  }
}
```

## Publish social

```json
{
  "publishJobId": "…",
  "execution": {
    "schemaVersion": 1,
    "publish": {
      "jobType": "publish_social",
      "publishJobId": "…",
      "publish": {
        "destinationKey": "facebook_timeline",
        "body": "…",
        "media": [],
        "dryRun": false
      },
      "missionRun": null,
      "browser": { "browserMode": "cdp" }
    }
  }
}
```

## Evidence (worker → CMS)

```json
{
  "evidence": {
    "sourcePatches": [
      { "sourceId": "…", "checkpoint": {}, "nextScanAt": "…" }
    ],
    "publishResult": { "ok": true }
  }
}
```

Hydration: `hydrateJobForExecution()` in `server/modules/control-plane/execution/jobHydrator.ts`.

Types: `server/modules/control-plane/execution/jobPayloadContract.ts`.
