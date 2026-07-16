# Publish Evidence

**Module:** `server/modules/social-publishing/runtime/publishEvidenceService.ts`

---

## Purpose

Standardize publish verification artifacts — **not** a separate Publisher-only store. Uses shared `runtime/publish-evidence/` tree (same runtime root as browser profile).

---

## Evidence bundle

```ts
interface PublishEvidenceBundle {
  publishJobId: string;
  missionRunId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  destinationKey?: string | null;
  durationMs: number;
  publishedUrl?: string | null;
  domHash?: string | null;
  screenshotBeforePath?: string | null;
  screenshotAfterPath?: string | null;
  htmlSnapshotPath?: string | null;
  capturedAt: string;
}
```

---

## Storage layout

```
runtime/publish-evidence/
  {publishJobId}/
    {attemptId}/
      manifest.json
      screenshot-before.png   # Phase C+ (paths reserved in foundation)
      screenshot-after.png
      composer.html
```

Foundation phase writes **manifest.json** only; image/HTML paths are reserved in manifest.

---

## Functions

| Function | Role |
|----------|------|
| `hashDomContent(text)` | SHA-256 normalized DOM fingerprint |
| `buildEvidencePaths(jobId, attemptId)` | Path builder |
| `writePublishEvidenceManifest(attemptId, bundle)` | Persist manifest |
| `readPublishEvidenceManifest(jobId, attemptId)` | Load manifest |
| `createStubEvidenceBundle(input)` | Foundation / dry-run |

---

## Workflow integration

`browser_capture_evidence` step calls `writePublishEvidenceManifest` with attempt id `wf_{missionRunId}_{stepId}`.

Links to:

- `SocialPublishAttempt` (job-level DB log) — optional merge in Phase C
- Mission run timeline step output `evidence` field
- CMS Logs UI — read manifest paths

---

## Security

- No access tokens in manifest
- HTML snapshot truncated at write time (Phase C)
- Evidence dirs scoped by `publishJobId` (tenant isolation via job `companyId` at API layer)
