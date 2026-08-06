# Destination Registry

**Module:** `server/modules/social-publishing/browser/destinationRegistry.ts`

---

## Registered destinations (Phase A)

| Key | Label | Channel mapping |
|-----|-------|-----------------|
| `facebook_timeline` | Facebook Timeline | `facebook_profile` + `browser` |
| `facebook_group` | Facebook Group | `facebook_group` + `browser` |
| `facebook_page_web` | Facebook Page (Web) | `facebook_page` + `browser` |

Explicit override: `channel.config.destinationKey`

---

## API

```ts
listDestinationRegistrations(): DestinationRegistration[]
getDestinationRegistration(key): DestinationRegistration | undefined
resolveDestinationAdapter(key): BrowserDestinationAdapter
resolveDestinationAdapterForChannel(channel): BrowserDestinationAdapter
resolveDestinationKeyFromChannel(channel): DestinationKey | null
isDestinationKey(value): boolean
```

No `switch-case` — adapters registered in `bootstrapDefaults()`.

---

## BrowserDestinationAdapter

```ts
prepare()
navigate()
ensureAuthenticated()
uploadMedia()
fillContent()
publish()
verify()
captureEvidence()
cleanup()
```

Phase A: `StubBrowserDestinationAdapter` returns `dryRun: true` results.

---

## Capabilities

Read from `DESTINATION_CAPABILITY_PRESETS` / `getCapabilitiesForDestination(key)`.

| Capability | Timeline | Group | Page Web |
|------------|----------|-------|----------|
| supportsText | yes | yes | yes |
| supportsImage | yes | yes | yes |
| supportsVideo | no | no | no |
| supportsLinks | yes | yes | yes |
| supportsScheduling | no | no | no |
| supportsVerification | yes | yes | yes |

UI and workflow must call `assertCapability()` — never hardcode per platform in UI.

---

## Adding a destination (future)

1. Add key to `DESTINATION_KEYS`
2. Add capability preset
3. Register adapter in `bootstrapDefaults()`
4. Map `SocialChannel.type` in `resolveDestinationKeyFromChannel`

No changes to registry core.
