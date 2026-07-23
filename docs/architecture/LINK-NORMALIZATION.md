# Link Normalization

**Module:** `server/modules/link-normalization/`  
**Consumers:** Telegram Smart Ops, Publish Evidence enrichment  
**Does not:** drive Browser Runtime, Mission Engine, or Scanner

---

## Goal

Never send temporary / wrapper URLs to Telegram. Always prefer a stable permalink that opens on:

- Android
- iPhone
- Telegram In-App Browser
- Facebook App (universal / app links)

No `window.location` or browser JS navigation — absolute `https://` URLs only.

---

## Canonical fields

```ts
{
  postId: string | null;
  postUrl: string | null;
  groupId: string | null;
  groupUrl: string | null;
  canonicalUrl: string | null; // best open URL (post → group)
  verified: boolean;
  mobileVerified: boolean;
}
```

---

## Pipeline

```
raw URL(s)
  → unwrap Facebook redirects (l.php / lm.facebook.com)
  → strip tracking (fbclid, utm_*, __tn__, …)
  → reject ephemeral (about:blank, blob:, login/checkpoint, localhost)
  → extract postId / groupId
  → build www.facebook.com permalinks
  → verify (HTTP HEAD/GET adapter)
  → fallback: group URL if post fails
```

If verification fails for all candidates → Telegram **must not** send the alert with those links (`link_unverified`).

---

## Adapters

| Export | Role |
|--------|------|
| `normalizeSocialLinks` | Pure normalize + id extract |
| `verifyOpenableUrl` | Single URL HTTP check |
| `verifySocialLinks` | Post-first, group fallback |
| `toMobileFriendlyFacebookUrl` | Host/path mobile-safe rewrite |
| `isEphemeralUrl` | Temporary URL gate |

Inject `fetchImpl` in tests — no live network required.

---

## Publish Evidence

`writePublishEvidenceManifest` / `enrichPublishEvidenceLinks` attach the same metadata onto `PublishEvidenceBundle` without changing Browser Runtime adapters.

---

## Rules

- DRY: one module for Telegram + evidence
- No hardcoded CMS destination URLs
- No duplicate normalize logic in Telegram layer
- Verification is an Adapter — swappable `FetchLike`
