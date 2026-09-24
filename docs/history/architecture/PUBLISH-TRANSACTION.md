# Publish Transaction

## State machine

```
queued
  → acquire claim lock (channel exclusive + claimedBy)
  → claimed
  → preparing
  → publishing
      → upload media (wait thumbnail)
      → editor transaction (clear → insert once → read-back)
      → anti-dupe feed check
      → publish click (exactly once)
      → patch result { publishClicked: true }
      → verify (caption / media / permalink)
  → published   OR   failed(publish_verify_unknown)
```

## Exactly-once rules

1. **Idempotency key** (job create): `draftId:channelId:scheduledAtISO` — unique in DB.
2. **Runtime idempotency** (publishJobId): once `publishClicked` or `externalPostId` or `publishOutcome=unknown|published` is set, **no second click**.
3. While status ∈ `{claimed, preparing, publishing}` and `claimedBy` ≠ this worker → claim returns null (other agent cannot steal).
4. Stale reclaim after 10m:
   - If publish already clicked / unknown → **terminal** `publish_verify_unknown` + `needsManualVerify`
   - Else → requeue (safe; no click happened)

## Editor transaction

```
Focus composer
→ Ctrl/Meta+A
→ Delete / Backspace
→ Verify empty (else FAIL)
→ Insert caption ONCE
→ Read back
→ Compare to payload (else FAIL browser_composer_mismatch)
→ NEVER retry paste
```

## Media-first + URL policy

```
Open composer
→ Upload image/video
→ Wait thumbnail / upload complete
→ Resolve caption (media_first: strip URLs, defer linkUrl)
→ Insert caption
→ Publish
```

Deferred URL is recorded for a later first-comment path — never put in caption when media exists (avoids FB link-preview replacing the image).

## Verify

After Publish click:

- Collect feed signals + permalink
- OK → `publishOutcome=published`, complete job
- Timeout / weak signals → `publishOutcome=unknown`, **do not republish**

## Trace events

`AcquireLock` · `EditorFocus` · `EditorEmpty` · `InsertText` · `ReadBack` · `UploadMedia` · `ThumbnailVisible` · `AntiDuplicateCheck` · `PublishClick` · `SpinnerGone` · `VerifyFeed` · `Permalink` · `VerifyUnknown` · `Complete` · `Duration`
