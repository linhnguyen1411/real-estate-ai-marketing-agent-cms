# Prompt Library Foundation (H0.8)

Design only — **no content generation** in H0.

## Platforms

Facebook · Threads · Instagram · TikTok · SEO · Email · SMS · Zalo

## Prompt schema (every entry)

| Field | Description |
|-------|-------------|
| `id` | Stable key e.g. `fb.timeline.listing.vi` |
| `role` | System persona |
| `goal` | One outcome |
| `audience` | Buyer / seller / investor |
| `tone` | Professional / warm / urgent |
| `length` | Soft max chars / words |
| `cta` | Desired call to action |
| `platform` | Destination constraints |
| `language` | `vi` / `en` |
| `hashtags` | Policy (count, style) |
| `restrictions` | Legal / brand / no-price-spam |

## Starter catalog (IDs only)

```
fb.timeline.listing.vi
fb.group.buyer-seek.vi
threads.short.vi
ig.carousel.caption.vi
tiktok.hook.vi
seo.meta.description.vi
email.nurture.vi
sms.alert.vi
zalo.oa.brief.vi
```

## Storage (future H2)

`docs/prompts/` markdown → later DB `PromptTemplate` with versioning.  
Do not hardcode prompts inside publishers.
